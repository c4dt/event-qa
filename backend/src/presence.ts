import type { DB } from './db.js';

const PRESENCE_WINDOW_MS = 60_000;

export function isOnline(db: DB, userId: number, now = Date.now()): boolean {
  const row = db
    .prepare<[number, number], { c: number }>(
      'SELECT COUNT(*) AS c FROM sessions WHERE user_id = ? AND last_seen > ?',
    )
    .get(userId, now - PRESENCE_WINDOW_MS);
  return (row?.c ?? 0) > 0;
}
