import { Router, type Request, type Response, type NextFunction } from 'express';
import { requireAuth } from './context.js';

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.user?.is_admin !== 1) {
    res.status(403).json({ error: 'forbidden' });
    return;
  }
  next();
}

export const adminRouter: Router = Router();
adminRouter.use(requireAuth, requireAdmin);

// TODO: DELETE /api/admin/questions/:id
adminRouter.delete('/questions/:id', (_req, res) => {
  res.status(501).json({ error: 'not_implemented' });
});

// TODO: DELETE /api/admin/messages/:id
adminRouter.delete('/messages/:id', (_req, res) => {
  res.status(501).json({ error: 'not_implemented' });
});

// TODO: POST /api/admin/questions/:id/answered
adminRouter.post('/questions/:id/answered', (_req, res) => {
  res.status(501).json({ error: 'not_implemented' });
});

// TODO: POST /api/admin/users/:alias/ban
adminRouter.post('/users/:alias/ban', (_req, res) => {
  res.status(501).json({ error: 'not_implemented' });
});

// TODO: PATCH /api/admin/users/:alias
adminRouter.patch('/users/:alias', (_req, res) => {
  res.status(501).json({ error: 'not_implemented' });
});
