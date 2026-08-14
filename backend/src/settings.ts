import type { DB } from './db.js';

const DEFAULTS: Record<string, boolean> = {
  allow_non_admin_questions: true,
};

export function getBoolSetting(db: DB, key: string): boolean {
  const row = db.prepare<[string], { value: string }>('SELECT value FROM settings WHERE key = ?').get(key);
  if (!row) return DEFAULTS[key] ?? false;
  return row.value === '1';
}

export function setBoolSetting(db: DB, key: string, value: boolean): void {
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(key, value ? '1' : '0');
}
