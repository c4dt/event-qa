import { randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import type { DB } from './db.js';
import type { EventConfig } from './config.js';

export type UserRow = {
  id: number;
  alias: string;
  password_hash: string | null;
  name: string | null;
  affiliation: string | null;
  bio: string | null;
  created_at: number;
  banned: number;
  is_admin: number;
};

export type PublicUser = {
  id: number;
  alias: string;
  name: string | null;
  affiliation: string | null;
  bio: string | null;
  is_admin: boolean;
};

export type LoginInput = {
  alias: string;
  password?: string;
  name?: string;
  affiliation?: string;
  bio?: string;
};

export type LoginResult =
  | { ok: true; token: string; user: PublicUser }
  | { ok: false; code: 'alias_busy' | 'bad_password' | 'banned' | 'invalid' };

const PRESENCE_WINDOW_MS = 60_000;
const DEFAULT_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function makeToken(): string {
  return randomBytes(32).toString('base64url');
}

export function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    alias: row.alias,
    name: row.name,
    affiliation: row.affiliation,
    bio: row.bio,
    is_admin: row.banned === 0 && row.is_admin === 1,
  };
}

export function syncAdmins(db: DB, cfg: EventConfig, now = Date.now()): void {
  const upsert = db.prepare(`
    INSERT INTO users (alias, password_hash, created_at, is_admin)
    VALUES (?, ?, ?, 1)
    ON CONFLICT(alias) DO UPDATE SET
      password_hash = excluded.password_hash,
      is_admin = 1
  `);
  const tx = db.transaction((admins: { alias: string; password: string }[]) => {
    for (const a of admins) {
      upsert.run(a.alias, a.password, now);
    }
  });
  tx(cfg.admins);
}

export class Auth {
  constructor(
    private readonly db: DB,
    private readonly sessionTtlMs: number = DEFAULT_SESSION_TTL_MS,
  ) {}

  private getUserByAlias(alias: string): UserRow | undefined {
    return this.db
      .prepare<[string], UserRow>('SELECT * FROM users WHERE alias = ? COLLATE NOCASE')
      .get(alias);
  }

  getUserById(id: number): UserRow | undefined {
    return this.db.prepare<[number], UserRow>('SELECT * FROM users WHERE id = ?').get(id);
  }

  isAliasBusy(userId: number, now: number): boolean {
    const row = this.db
      .prepare<[number, number], { c: number }>(
        'SELECT COUNT(*) AS c FROM sessions WHERE user_id = ? AND last_seen > ?',
      )
      .get(userId, now - PRESENCE_WINDOW_MS);
    return (row?.c ?? 0) > 0;
  }

  private insertUser(input: LoginInput, hash: string | null, now: number): UserRow {
    const info = this.db
      .prepare(
        `INSERT INTO users (alias, password_hash, name, affiliation, bio, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.alias,
        hash,
        input.name ?? null,
        input.affiliation ?? null,
        input.bio ?? null,
        now,
      );
    return this.getUserById(Number(info.lastInsertRowid))!;
  }

  private mintSession(userId: number, now: number): string {
    const token = makeToken();
    this.db
      .prepare(
        'INSERT INTO sessions (token, user_id, created_at, expires_at, last_seen) VALUES (?, ?, ?, ?, ?)',
      )
      .run(token, userId, now, now + this.sessionTtlMs, now);
    return token;
  }

  private invalidateSessions(userId: number): void {
    this.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
  }

  async login(input: LoginInput, now = Date.now()): Promise<LoginResult> {
    const alias = input.alias.trim();
    if (!alias) return { ok: false, code: 'invalid' };

    const existing = this.getUserByAlias(alias);

    if (!existing) {
      const hash = input.password ? await argon2.hash(input.password, { type: argon2.argon2id }) : null;
      const created = this.insertUser({ ...input, alias }, hash, now);
      const token = this.mintSession(created.id, now);
      return { ok: true, token, user: toPublicUser(created) };
    }

    if (existing.banned === 1) return { ok: false, code: 'banned' };

    const requiresPassword = existing.is_admin === 1 || existing.password_hash !== null;

    if (requiresPassword) {
      if (!input.password || !existing.password_hash) return { ok: false, code: 'bad_password' };
      const ok = await argon2.verify(existing.password_hash, input.password);
      if (!ok) return { ok: false, code: 'bad_password' };
      const token = this.mintSession(existing.id, now);
      return { ok: true, token, user: toPublicUser(existing) };
    }

    // Passwordless existing user: claim if idle, else busy.
    if (this.isAliasBusy(existing.id, now)) return { ok: false, code: 'alias_busy' };
    this.invalidateSessions(existing.id);
    const token = this.mintSession(existing.id, now);
    return { ok: true, token, user: toPublicUser(existing) };
  }

  authenticate(token: string, now = Date.now()): UserRow | null {
    const row = this.db
      .prepare<[string], UserRow & { expires_at: number }>(
        `SELECT u.*, s.expires_at FROM sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.token = ?`,
      )
      .get(token);
    if (!row) return null;
    if (row.expires_at < now) {
      this.db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
      return null;
    }
    if (row.banned === 1) return null;
    this.db.prepare('UPDATE sessions SET last_seen = ? WHERE token = ?').run(now, token);
    return row;
  }

  logout(token: string): void {
    this.db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  }
}
