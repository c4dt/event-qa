import { existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import express, { type Express, type Request, type Response } from 'express';
import type { WebSocketServer } from 'ws';
import { attachCtx, type AppCtx } from './http/context.js';
import { authRouter, meRouter } from './http/auth.js';
import { eventRouter } from './http/schedule.js';
import { usersRouter } from './http/users.js';
import { makeQuestionsRouters } from './http/questions.js';
import { makeDmsRouters } from './http/dms.js';
import { makeAdminRouter } from './http/admin.js';

export type AppOptions = {
  staticDir?: string | null;
  wss?: WebSocketServer;
};

export function createApp(ctx: AppCtx, opts: AppOptions = {}): Express {
  const app = express();
  app.use(express.json({ limit: '256kb' }));
  app.use(attachCtx(ctx));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  const { talksRouter, questionsRouter } = makeQuestionsRouters(opts.wss);
  const { dmsRouter, unreadRouter } = makeDmsRouters(opts.wss);
  const adminRouter = makeAdminRouter(opts.wss);

  app.use('/api/auth', authRouter);
  app.use('/api/me', meRouter);
  app.use('/api', eventRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/talks', talksRouter);
  app.use('/api/questions', questionsRouter);
  app.use('/api/dm', dmsRouter);
  app.use('/api/unread', unreadRouter);
  app.use('/api/admin', adminRouter);

  if (opts.staticDir) {
    const dir = resolve(opts.staticDir);
    if (existsSync(dir) && statSync(dir).isDirectory()) {
      app.use(express.static(dir, { index: false }));
      app.get('*', (_req: Request, res: Response) => {
        res.sendFile(join(dir, 'index.html'));
      });
    }
  }

  return app;
}
