import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { isDataset, stats } from '../frontend/src/lib/dashboard.ts';
const require = createRequire(import.meta.url);
const { mapGameplayRecords } = require('../backend/dist/gameplay/map-gameplay.js');
const { GameplayService } = require('../backend/dist/gameplay/gameplay.service.js');
const { ConfigService } = require('@nestjs/config');
const catalog = [{ id: 6, name: 'Charizard', types: ['fire', 'flying'] }, { id: 9, name: 'Blastoise', types: ['water'] }];
const encounter = { id: 1, run_id: 'run', session_id: 's1', player_id: '001', player_name: 'Trainer', night: 1, team: 'Charizard, Blastoise', team_state: [{ pokemon: 'Charizard', hp_end: 0 }, { pokemon: 'Blastoise', hp_end: 179 }], opponent: 'Freddy', hp_start: 620, hp_end: 179, damage_dealt: 1530, outcome: 'win', data_source: 'real', created_at: '2026-10-20T08:00:00Z', turn_count: 2, turns: [{ turn_number: 1, active_pokemon: 'Charizard', damage_taken: 620 }, { turn_number: 2, active_pokemon: 'Blastoise', damage_taken: 441 }] };

test('saved teams preserve both types and include each species only once per battle', () => {
  const data = mapGameplayRecords([], [encounter], catalog);
  assert.deepEqual(data.players[0].roster[0].types, ['Fire', 'Flying']);
  assert.deepEqual(data.battles[0].pokemon.map(p => p.pokemon), ['Charizard', 'Blastoise']);
  assert.deepEqual(data.battles[0].pokemon[0].types, ['Fire', 'Flying']);
  assert.equal(isDataset(data), true);
  assert.equal(isDataset({ ...data, battles: [{ ...data.battles[0], pokemon: [{ pokemon: 'Charizard', dex: 6, types: [123] }] }] }), false);
});

test('MMR joins by player ID and preserves zero and missing ratings', () => {
  const players = ['001', '002', '003'].map(id => ({ id, display_name: id }));
  const data = mapGameplayRecords(players, [], catalog, [{ player_id: '002', mmr: 0 }, { player_id: '001', mmr: 1500 }]);
  assert.deepEqual(data.players.map(p => p.mmr), [1500, 0, null]);
  assert.equal(isDataset(data), true);
  assert.equal(isDataset({ ...data, players: [{ ...data.players[0], mmr: '1500' }] }), false);
});

test('game records map actual roster and turn damage without inventing levels or activity', () => {
  const data = mapGameplayRecords([{ id: '001', display_name: 'Trainer' }, { id: '002', display_name: 'New player' }], [encounter], catalog);
  assert.equal(isDataset(data), true);
  assert.equal(data.players[0].pokemon, 'Blastoise');
  assert.equal(data.players[0].hp, 179);
  assert.equal(data.players[0].maxHp, 620);
  assert.equal(data.players[0].level, null);
  assert.equal(data.players[0].active, null);
  assert.equal(data.players[0].roster.length, 2);
  assert.equal(data.players[1].hp, null);
  assert.equal(data.players[1].condition, 'Unknown');
  assert.equal(data.battles[0].damageReceived, 1061);
  assert.notEqual(data.battles[0].damageReceived, encounter.hp_start - encounter.hp_end);
});
test('real and simulated records stay separate and nights do not mix within a session', () => {
  const data = mapGameplayRecords([], [encounter, { ...encounter, id: 2, night: 2 }, { ...encounter, id: 3, data_source: 'simulated' }], catalog);
  assert.equal(data.battles.length, 2);
  assert.equal(data.sessions.length, 2);
  assert.notEqual(data.battles[0].sessionId, data.battles[1].sessionId);
  assert.equal(isDataset(data), true);
});
test('missing historical turns and unrecorded item counts remain unavailable', () => {
  const data = mapGameplayRecords([], [{ ...encounter, turns: [] }], catalog);
  assert.equal(data.battles[0].damageReceived, null);
  assert.equal(data.battles[0].itemsUsed, null);
  assert.equal(stats(data.battles).damageRecords, 0);
  assert.equal(stats(data.battles).items, null);
  assert.equal(isDataset(data), true);
});
test('local access is explicit and rejects remote sockets, foreign origins, and forged proxy headers', async () => {
  const locked = new GameplayService(new ConfigService({ DASHBOARD_LOCAL_MODE: 'false' }));
  await assert.rejects(locked.authorize(undefined, '127.0.0.1'), e => e.getStatus() === 401);
  const local = new GameplayService(new ConfigService({ DASHBOARD_LOCAL_MODE: 'true', FRONTEND_URL: 'http://localhost:3000' }));
  await local.authorize(undefined, '127.0.0.1', 'http://localhost:3000');
  await assert.rejects(local.authorize(undefined, '192.0.2.1', 'http://localhost:3000'), e => e.getStatus() === 401);
  await assert.rejects(local.authorize(undefined, '127.0.0.1', 'https://foreign.example'), e => e.getStatus() === 401);
  const previous = process.env.NODE_ENV;
  try { process.env.NODE_ENV = 'production'; await assert.rejects(local.authorize(undefined, '127.0.0.1', 'http://localhost:3000'), e => e.getStatus() === 401); }
  finally { if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous; }
});
