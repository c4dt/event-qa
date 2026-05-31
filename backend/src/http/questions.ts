import { Router } from 'express';
import { requireAuth } from './context.js';

export const talksRouter: Router = Router();
talksRouter.use(requireAuth);

// TODO: GET /api/talks/:talkId/questions
talksRouter.get('/:talkId/questions', (_req, res) => {
  res.status(501).json({ error: 'not_implemented' });
});

// TODO: POST /api/talks/:talkId/questions
talksRouter.post('/:talkId/questions', (_req, res) => {
  res.status(501).json({ error: 'not_implemented' });
});

export const questionsRouter: Router = Router();
questionsRouter.use(requireAuth);

// TODO: GET /api/questions/:id (with messages)
questionsRouter.get('/:id', (_req, res) => {
  res.status(501).json({ error: 'not_implemented' });
});

// TODO: POST /api/questions/:id/messages
questionsRouter.post('/:id/messages', (_req, res) => {
  res.status(501).json({ error: 'not_implemented' });
});

// TODO: POST /api/questions/:id/upvote (toggle)
questionsRouter.post('/:id/upvote', (_req, res) => {
  res.status(501).json({ error: 'not_implemented' });
});

// TODO: POST /api/questions/:id/read
questionsRouter.post('/:id/read', (_req, res) => {
  res.status(501).json({ error: 'not_implemented' });
});
