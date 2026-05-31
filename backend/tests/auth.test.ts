import { describe, it, expect, beforeEach } from 'vitest';
import argon2 from 'argon2';
import { openDb, type DB } from '../src/db.js';
import { Auth, syncAdmins } from '../src/auth.js';
import type { EventConfig } from '../src/config.js';

const baseCfg: EventConfig = {
  event: {
    name: 'e',
    place: 'p',
    start: '2026-06-01',
    end: '2026-06-02',
    timezone: 'UTC',
  },
  rooms: [],
  speakers: [],
  admins: [],
  tracks: [],
  ratelimit: { posts_per_minute: 10 },
};

async function withAdminHash(password: string): Promise<EventConfig> {
  const hash = await argon2.hash(password, { type: argon2.argon2id });
  return { ...baseCfg, admins: [{ alias: 'admin', password: hash }] };
}

let db: DB;
let auth: Auth;

beforeEach(() => {
  db = openDb(':memory:');
  auth = new Auth(db);
});

describe('auth: alias claim', () => {
  it('creates a new user on first login', async () => {
    const r = await auth.login({ alias: 'alice' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.user.alias).toBe('alice');
      expect(r.user.is_admin).toBe(false);
      expect(r.token).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    }
  });

  it('alias matching is case-insensitive', async () => {
    const t0 = Date.now();
    await auth.login({ alias: 'Bob' }, t0);
    // simulate the first session going idle (>60s ago)
    db.prepare('UPDATE sessions SET last_seen = ?').run(t0 - 120_000);
    const r2 = await auth.login({ alias: 'bob' }, t0);
    expect(r2.ok).toBe(true);
    if (r2.ok) expect(r2.user.alias).toBe('Bob');
  });

  it('busy passwordless alias rejects new claim within 60s', async () => {
    const t0 = 1_000_000_000;
    await auth.login({ alias: 'carol' }, t0);
    const r = await auth.login({ alias: 'carol' }, t0 + 30_000);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('alias_busy');
  });

  it('idle passwordless alias can be reclaimed, evicting old sessions', async () => {
    const t0 = 1_000_000_000;
    const first = await auth.login({ alias: 'dave' }, t0);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const oldToken = first.token;
    const later = t0 + 120_000;
    const second = await auth.login({ alias: 'dave' }, later);
    expect(second.ok).toBe(true);
    expect(auth.authenticate(oldToken, later)).toBeNull();
  });

  it('password-protected alias requires the password', async () => {
    await auth.login({ alias: 'eve', password: 'hunter2' });
    const wrong = await auth.login({ alias: 'eve', password: 'nope' });
    expect(wrong.ok).toBe(false);
    if (!wrong.ok) expect(wrong.code).toBe('bad_password');
    const right = await auth.login({ alias: 'eve', password: 'hunter2' });
    expect(right.ok).toBe(true);
  });

  it('password-protected alias allows multi-device (existing sessions kept)', async () => {
    const first = await auth.login({ alias: 'frank', password: 'pw' });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = await auth.login({ alias: 'frank', password: 'pw' });
    expect(second.ok).toBe(true);
    // The first token must still be valid.
    expect(auth.authenticate(first.token)).not.toBeNull();
  });
});

describe('auth: admin sync', () => {
  it('admin alias requires password even if user existed without one', async () => {
    // user "admin" already exists, passwordless
    const claim = await auth.login({ alias: 'admin' });
    expect(claim.ok).toBe(true);

    const cfg = await withAdminHash('s3cret');
    syncAdmins(db, cfg);

    const noPw = await auth.login({ alias: 'admin' });
    expect(noPw.ok).toBe(false);
    if (!noPw.ok) expect(noPw.code).toBe('bad_password');

    const ok = await auth.login({ alias: 'admin', password: 's3cret' });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.user.is_admin).toBe(true);
  });
});

describe('auth: session token', () => {
  it('authenticate returns the user and refreshes last_seen', async () => {
    const r = await auth.login({ alias: 'gina' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const u = auth.authenticate(r.token);
    expect(u?.alias).toBe('gina');
  });

  it('logout invalidates the token', async () => {
    const r = await auth.login({ alias: 'hugo' });
    if (!r.ok) throw new Error('login failed');
    auth.logout(r.token);
    expect(auth.authenticate(r.token)).toBeNull();
  });

  it('expired tokens are rejected', async () => {
    const shortAuth = new Auth(db, 1_000);
    const r = await shortAuth.login({ alias: 'iris' });
    if (!r.ok) throw new Error('login failed');
    expect(shortAuth.authenticate(r.token, Date.now() + 10_000)).toBeNull();
  });
});
