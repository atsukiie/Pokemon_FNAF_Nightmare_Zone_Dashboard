import { HttpException, HttpStatus, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { mapGameplayRecords, EncounterRecord, GamePlayer, PokemonRecord } from './map-gameplay';

@Injectable()
export class GameplayService {
  private readonly client: SupabaseClient | null;
  private readonly supabaseUrl: string | undefined;
  private readonly serviceKey: string | undefined;
  private readonly adminAccessCode: string | undefined;
  private readonly accessSessions = new Map<string, number>();
  private readonly failedCodeAttempts = new Map<string, { count: number; windowStarted: number; lockedUntil: number }>();
  constructor(private readonly config: ConfigService) {
    let external: Record<string, string | undefined> = {};
    const file = config.get<string>('GAME_ENV_FILE');
    if (file) {
      try { external = parseEnv(readFileSync(resolve(process.cwd(), file), 'utf8')); }
      catch { throw new Error('Unable to read GAME_ENV_FILE. Check the server-side configuration path.'); }
    }
    this.supabaseUrl = config.get<string>('SUPABASE_URL') || external.SUPABASE_URL;
    this.serviceKey = config.get<string>('SUPABASE_SERVICE_ROLE_KEY') || external.SUPABASE_SERVICE_ROLE_KEY;
    this.adminAccessCode = config.get<string>('DASHBOARD_ACCESS_CODE');
    this.client = this.supabaseUrl && this.serviceKey ? createClient(this.supabaseUrl, this.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
  }
  get isConfigured() { return this.client !== null; }
  private getClient() {
    if (!this.client) throw new ServiceUnavailableException('Configure the shared game database on the dashboard backend.');
    return this.client;
  }
  async signInWithAccessCode(code: string, remoteAddress?: string) {
    if (!this.adminAccessCode) throw new ServiceUnavailableException('Set DASHBOARD_ACCESS_CODE in backend/.env to enable sign-in.');
    const now = Date.now();
    const address = remoteAddress || 'unknown';
    const attempt = this.failedCodeAttempts.get(address);
    if (attempt?.lockedUntil && attempt.lockedUntil > now) throw new HttpException('Too many incorrect codes. Try again in 10 minutes.', HttpStatus.TOO_MANY_REQUESTS);
    const expected = Buffer.from(this.adminAccessCode, 'utf8');
    const provided = Buffer.from(code, 'utf8');
    const matches = provided.length === expected.length && timingSafeEqual(provided, expected);
    if (!matches) {
      const withinWindow = attempt && now - attempt.windowStarted < 10 * 60 * 1000;
      const count = withinWindow ? attempt.count + 1 : 1;
      const windowStarted = withinWindow ? attempt.windowStarted : now;
      this.failedCodeAttempts.set(address, { count, windowStarted, lockedUntil: count >= 5 ? now + 10 * 60 * 1000 : 0 });
      throw new UnauthorizedException('The access code is incorrect.');
    }
    this.failedCodeAttempts.delete(address);
    for (const [session, expiry] of this.accessSessions) if (expiry <= now) this.accessSessions.delete(session);
    const accessToken = randomBytes(32).toString('base64url');
    this.accessSessions.set(accessToken, now + 8 * 60 * 60 * 1000);
    return { accessToken };
  }
  signOut(authorization?: string) {
    const token = authorization?.match(/^Bearer (\S+)$/i)?.[1];
    if (token) this.accessSessions.delete(token);
    return { ok: true };
  }
  private async readActiveRunCount(): Promise<number | null> {
    const baseUrl = (this.config.get<string>('GAME_API_URL') || 'http://127.0.0.1:3001/api').replace(/\/+$/, '');
    try {
      const response = await fetch(`${baseUrl}/analytics`, { signal: AbortSignal.timeout(3000), cache: 'no-store' });
      if (!response.ok) return null;
      const payload: unknown = await response.json();
      if (!payload || typeof payload !== 'object' || !('active' in payload) || typeof payload.active !== 'number' || !Number.isInteger(payload.active) || payload.active < 0) return null;
      return payload.active;
    } catch { return null; }
  }
  async liveStatus() {
    return { activeRuns: await this.readActiveRunCount(), checkedAt: new Date().toISOString() };
  }
  async authorize(authorization: string | undefined, remoteAddress: string | undefined, origin?: string) {
    const loopback = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remoteAddress || '');
    const localMode = this.config.get<string>('DASHBOARD_LOCAL_MODE') === 'true' && process.env.NODE_ENV !== 'production';
    const trustedOrigin = !origin || origin === this.config.get<string>('FRONTEND_URL', 'http://localhost:3000');
    if (localMode && loopback && trustedOrigin) return;
    const token = authorization?.match(/^Bearer (\S+)$/i)?.[1];
    if (!token) throw new UnauthorizedException('An administrator access token is required.');
    const sessionExpiry = this.accessSessions.get(token);
    if (sessionExpiry !== undefined) {
      if (sessionExpiry > Date.now()) return;
      this.accessSessions.delete(token);
    }
    throw new UnauthorizedException('Invalid or expired administrator session.');
  }
  private async readRows<T>(table: string, columns: string, key: string, realOnly = false): Promise<T[]> {
    const rows: T[] = [];
    // Keyset pagination avoids the default 1,000-row limit and shifting offsets.
    let cursor: string | number | undefined;
    for (;;) {
      let query = this.getClient().from(table).select(columns).order(key).limit(500);
      if (realOnly) query = query.eq('data_source', 'real');
      if (cursor !== undefined) query = query.gt(key, cursor);
      const { data, error } = await query;
      if (error || !data) throw new ServiceUnavailableException(`Unable to read game ${table} records.`);
      if (!data.length) return rows;
      rows.push(...(data as unknown as T[]));
      if (rows.length > 20000) throw new ServiceUnavailableException('Dataset exceeds 20,000 records. Add server-side period aggregation.');
      cursor = (data[data.length - 1] as unknown as Record<string, string | number>)[key];
      if (cursor === undefined) throw new ServiceUnavailableException('Invalid game record cursor.');
    }
  }
  async dashboard() {
    // Ongoing player state is never reconstructed from completed encounters.
    const [encounters, players, pokemon, activeRuns, profiles] = await Promise.all([
      this.readRows<EncounterRecord>('encounters', 'id,run_id,session_id,player_id,player_name,night,team,team_state,opponent,hp_start,hp_end,damage_dealt,outcome,data_source,created_at,turn_count,turns(turn_number,active_pokemon,hp_before,hp_after)', 'id'),
      this.readRows<GamePlayer>('players', 'id,display_name', 'id'),
      this.readRows<PokemonRecord>('pokemon', 'id,name,types', 'id'),
      this.readActiveRunCount(),
      this.readRows<{ player_id: string; mmr: number | null }>('trainer_profiles', 'player_id,mmr', 'player_id'),
    ]);
    return { ...mapGameplayRecords(players, encounters, pokemon, profiles), activeRuns };
  }
}
