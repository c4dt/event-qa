import type { AppCtx } from './http/context.js';
import type { DB } from './db.js';
import { syncAdmins } from './auth.js';
import { RateLimiter } from './ratelimit.js';
import { loadConfigAsync } from './config-source.js';
import { log } from './util/log.js';

export async function reloadConfig(ctx: AppCtx, db: DB, source: string): Promise<void> {
  let next;
  try {
    next = await loadConfigAsync(source);
  } catch (err) {
    log.warn({ err, source }, 'event config refresh failed, keeping previous config');
    return;
  }
  ctx.cfg = next;
  syncAdmins(db, next);
  ctx.ratelimit = new RateLimiter(next.ratelimit.posts_per_minute);
  log.info({ source }, 'event config reloaded');
}
