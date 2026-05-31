import { Router } from 'express';
import { requireAuth } from './context.js';

export const usersRouter: Router = Router();
usersRouter.use(requireAuth);

// TODO: list users with counts + last_seen.
usersRouter.get('/', (_req, res) => {
  res.status(501).json({ error: 'not_implemented' });
});

// TODO: one user's public profile + activity.
usersRouter.get('/:alias', (_req, res) => {
  res.status(501).json({ error: 'not_implemented' });
});
