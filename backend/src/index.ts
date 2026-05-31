import { createServer } from 'node:http';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { openDb } from './db.js';
import { Auth, syncAdmins } from './auth.js';
import { RateLimiter } from './ratelimit.js';
import { attachWsHub } from './ws/hub.js';
import { env, envDurationMs, envInt } from './util/env.js';
import { log } from './util/log.js';

async function main(): Promise<void> {
  const cfgPath = env('EVENT_CONFIG', '/data/event.yaml');
  const dbPath = env('DB_PATH', '/data/event-qa.db');
  const port = envInt('PORT', 3000);
  const sessionTtl = envDurationMs('SESSION_TTL', 30 * 24 * 60 * 60 * 1000);

  log.info({ cfgPath, dbPath }, 'starting event-qa');

  const cfg = loadConfig(cfgPath);
  const db = openDb(dbPath);
  syncAdmins(db, cfg);

  const auth = new Auth(db, sessionTtl);
  const ratelimit = new RateLimiter(cfg.ratelimit.posts_per_minute);

  const app = createApp({ db, cfg, auth, ratelimit });
  const server = createServer(app);
  attachWsHub(server, { db, cfg, auth, ratelimit });

  server.listen(port, () => {
    log.info({ port }, 'event-qa listening');
  });
}

main().catch((err) => {
  log.error({ err }, 'fatal');
  process.exit(1);
});
