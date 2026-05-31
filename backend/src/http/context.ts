import type { Request, Response, NextFunction } from 'express';
import type { Auth, UserRow } from '../auth.js';
import type { EventConfig } from '../config.js';
import type { DB } from '../db.js';
import type { RateLimiter } from '../ratelimit.js';

export type AppCtx = {
  db: DB;
  cfg: EventConfig;
  auth: Auth;
  ratelimit: RateLimiter;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      ctx?: AppCtx;
      user?: UserRow;
      token?: string;
    }
  }
}

export function attachCtx(ctx: AppCtx) {
  return (req: Request, _res: Response, next: NextFunction) => {
    req.ctx = ctx;
    next();
  };
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const ctx = req.ctx!;
  const header = req.header('authorization') ?? '';
  const m = /^Bearer\s+(\S+)$/.exec(header);
  if (!m) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  const token = m[1]!;
  const user = ctx.auth.authenticate(token);
  if (!user) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  req.user = user;
  req.token = token;
  next();
}
