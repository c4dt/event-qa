import { Router } from 'express';
import { requireAuth } from './context.js';

export const dmsRouter: Router = Router();
dmsRouter.use(requireAuth);

// TODO: GET /api/dm/:alias
dmsRouter.get('/:alias', (_req, res) => {
  res.status(501).json({ error: 'not_implemented' });
});

// TODO: POST /api/dm/:alias
dmsRouter.post('/:alias', (_req, res) => {
  res.status(501).json({ error: 'not_implemented' });
});

// TODO: POST /api/dm/:alias/read
dmsRouter.post('/:alias/read', (_req, res) => {
  res.status(501).json({ error: 'not_implemented' });
});

export const unreadRouter: Router = Router();
unreadRouter.use(requireAuth);

// TODO: GET /api/unread
unreadRouter.get('/', (_req, res) => {
  res.json({ dms: {}, questions: {} });
});
