import { createClient } from '@supabase/supabase-js';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { mapGameplayRecords, type EncounterRecord, type GamePlayer, type PokemonRecord } from './map-gameplay';

const SESSION_LIFETIME_MS = 8 * 60 * 60 * 1000;
const failedAttempts = new Map<string, { count: number; windowStarted: number; lockedUntil: number }>();
const response = (message: string, status: number) => Response.json({ message }, { status, headers: { 'Cache-Control': 'no-store' } });
const sessionSecret = () => process.env.DASHBOARD_SESSION_SECRET;
const accessCode = () => process.env.DASHBOARD_ACCESS_CODE;

function signature(payload: string) {
  const secret = sessionSecret();
  if (!secret || secret.length < 32) throw new Error('Dashboard session security is not configured.');
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function issueSession() {
  const payload = `${Date.now() + SESSION_LIFETIME_MS}`;
  return `${payload}.${signature(payload)}`;
}

export function hasValidSession(request: Request) {
  const token = request.headers.get('authorization')?.match(/^Bearer (\S+)$/i)?.[1];
  if (!token) return false;
  const [expires, supplied, ...extra] = token.split('.');
  if (!expires || !supplied || extra.length || !/^\d+$/.test(expires) || Number(expires) <= Date.now()) return false;
  try {
    const expected = Buffer.from(signature(expires));
    const actual = Buffer.from(supplied);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch { return false; }
}

export async function login(request: Request) {
  const expectedCode = accessCode();
  if (!expectedCode) return response('Set DASHBOARD_ACCESS_CODE in Vercel Environment Variables.', 503);
  if (!sessionSecret() || sessionSecret()!.length < 32) return response('Set DASHBOARD_SESSION_SECRET in Vercel Environment Variables.', 503);
  let body: { accessCode?: unknown };
  try { body = await request.json() as { accessCode?: unknown }; }
  catch { return response('Enter the admin access code.', 400); }
  if (typeof body.accessCode !== 'string' || !body.accessCode.trim()) return response('Enter the admin access code.', 400);
  const clientAddress = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const now = Date.now();
  const attempt = failedAttempts.get(clientAddress);
  if (attempt?.lockedUntil && attempt.lockedUntil > now) return response('Too many incorrect codes. Try again in 10 minutes.', 429);
  const expected = Buffer.from(expectedCode, 'utf8');
  const provided = Buffer.from(body.accessCode, 'utf8');
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    const withinWindow = attempt && now - attempt.windowStarted < 10 * 60 * 1000;
    const count = withinWindow ? attempt.count + 1 : 1;
    failedAttempts.set(clientAddress, { count, windowStarted: withinWindow ? attempt.windowStarted : now, lockedUntil: count >= 5 ? now + 10 * 60 * 1000 : 0 });
    return response('The access code is incorrect.', 401);
  }
  failedAttempts.delete(clientAddress);
  return Response.json({ accessToken: issueSession() }, { headers: { 'Cache-Control': 'no-store' } });
}

function database() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel Environment Variables.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function readRows<T>(client: ReturnType<typeof database>, table: string, columns: string, key: string, realOnly = false): Promise<T[]> {
  const rows: T[] = [];
  let cursor: string | number | undefined;
  for (;;) {
    let query = client.from(table).select(columns).order(key).limit(500);
    if (realOnly) query = query.eq('data_source', 'real');
    if (cursor !== undefined) query = query.gt(key, cursor);
    const { data, error } = await query;
    if (error || !data) throw new Error(`Unable to read game ${table} records.`);
    if (!data.length) return rows;
    rows.push(...data as unknown as T[]);
    if (rows.length > 20000) throw new Error('Dataset exceeds 20,000 records.');
    cursor = (data[data.length - 1] as unknown as Record<string, string | number>)[key];
    if (cursor === undefined) throw new Error('Invalid game record cursor.');
  }
}

export async function dashboard(request: Request) {
  if (!hasValidSession(request)) return response('An administrator access token is required.', 401);
  try {
    const client = database();
    const [encounters, players, pokemon, profiles] = await Promise.all([
      readRows<EncounterRecord>(client, 'encounters', 'id,run_id,session_id,player_id,player_name,night,team,team_state,opponent,hp_start,hp_end,damage_dealt,outcome,data_source,created_at,turn_count,turns(turn_number,active_pokemon,hp_before,hp_after)', 'id'),
      readRows<GamePlayer>(client, 'players', 'id,display_name', 'id'),
      readRows<PokemonRecord>(client, 'pokemon', 'id,name,types', 'id'),
      readRows<{ player_id: string; mmr: number | null }>(client, 'trainer_profiles', 'player_id,mmr', 'player_id'),
    ]);
    return Response.json({ ...mapGameplayRecords(players, encounters, pokemon, profiles), activeRuns: null }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return response(error instanceof Error ? error.message : 'Gameplay records unavailable.', 503);
  }
}

export async function live(request: Request) {
  if (!hasValidSession(request)) return response('An administrator access token is required.', 401);
  const baseUrl = process.env.GAME_API_URL?.replace(/\/+$/, '');
  if (!baseUrl) return Response.json({ activeRuns: null, checkedAt: new Date().toISOString() }, { headers: { 'Cache-Control': 'no-store' } });
  try {
    const result = await fetch(`${baseUrl}/analytics`, { signal: AbortSignal.timeout(3000), cache: 'no-store' });
    const payload = await result.json() as { active?: unknown };
    const activeRuns = result.ok && typeof payload.active === 'number' && Number.isInteger(payload.active) && payload.active >= 0 ? payload.active : null;
    return Response.json({ activeRuns, checkedAt: new Date().toISOString() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ activeRuns: null, checkedAt: new Date().toISOString() }, { headers: { 'Cache-Control': 'no-store' } });
  }
}
