import { describe, it, expect, vi, beforeEach } from 'vitest';
import { openDb, type DB } from '../src/db.js';
import { parseConfig, type EventConfig } from '../src/config.js';
import { RateLimiter } from '../src/ratelimit.js';
import { Auth } from '../src/auth.js';
import type { AppCtx } from '../src/http/context.js';

vi.mock('../src/config-source.js', () => ({
  loadConfigAsync: vi.fn(),
}));

import { loadConfigAsync } from '../src/config-source.js';
import { reloadConfig } from '../src/config-reload.js';

function cfgWith(postsPerMinute: number, adminAlias: string): EventConfig {
  return parseConfig({
    event: { name: 'Conf', place: 'EPFL', start: '2026-06-01', end: '2026-06-02' },
    rooms: [{ id: 'main', name: 'Main Hall' }],
    speakers: [{ id: 'ada', name: 'Ada' }],
    admins: [{ alias: adminAlias, password: '$argon2id$v=19$m=65536,t=3,p=4$abc$def' }],
    tracks: [],
    ratelimit: { posts_per_minute: postsPerMinute },
  });
}

describe('reloadConfig', () => {
  let db: DB;
  let ctx: AppCtx;

  beforeEach(() => {
    db = openDb(':memory:');
    const cfg = cfgWith(10, 'admin');
    ctx = { db, cfg, auth: new Auth(db), ratelimit: new RateLimiter(cfg.ratelimit.posts_per_minute) };
    vi.mocked(loadConfigAsync).mockReset();
  });

  it('swaps cfg and ratelimit and syncs admins on success', async () => {
    const next = cfgWith(42, 'newadmin');
    vi.mocked(loadConfigAsync).mockResolvedValue(next);

    await reloadConfig(ctx, db, 'irrelevant-source');

    expect(ctx.cfg).toBe(next);
    expect(ctx.ratelimit).toBeInstanceOf(RateLimiter);
    const row = db.prepare('SELECT is_admin FROM users WHERE alias = ?').get('newadmin') as
      | { is_admin: number }
      | undefined;
    expect(row?.is_admin).toBe(1);
  });

  it('keeps the last-known-good config on failure', async () => {
    const previousCfg = ctx.cfg;
    const previousRatelimit = ctx.ratelimit;
    vi.mocked(loadConfigAsync).mockRejectedValue(new Error('network down'));

    await reloadConfig(ctx, db, 'irrelevant-source');

    expect(ctx.cfg).toBe(previousCfg);
    expect(ctx.ratelimit).toBe(previousRatelimit);
  });
});
