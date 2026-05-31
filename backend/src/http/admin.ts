import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth } from './context.js';
import type { WebSocketServer } from 'ws';

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.user?.is_admin !== 1) {
    res.status(403).json({ error: 'forbidden' });
    return;
  }
  next();
}

export function makeAdminRouter(wss?: WebSocketServer): Router {
  function broadcast(channel: string, payload: unknown) {
    if (!wss) return;
    const msg = JSON.stringify(payload);
    for (const client of wss.clients as Set<{ readyState: number; channels?: Set<string>; send: (s: string) => void }>) {
      if (client.readyState === 1 && client.channels?.has(channel)) {
        client.send(msg);
      }
    }
  }

  const adminRouter: Router = Router();
  adminRouter.use(requireAuth, requireAdmin);

  // DELETE /api/admin/questions/:id — hide question
  adminRouter.delete('/questions/:id', (req, res) => {
    const { db } = req.ctx!;
    const id = Number(req.params.id);
    const q = db.prepare<[number], { id: number; talk_id: string }>('SELECT id, talk_id FROM questions WHERE id = ?').get(id);
    if (!q) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    db.prepare('UPDATE questions SET hidden = 1 WHERE id = ?').run(id);

    const updatedQ = db
      .prepare<[number], { id: number; talk_id: string; author_id: number; title: string; created_at: number; hidden: number; answered: number }>(
        'SELECT * FROM questions WHERE id = ?',
      )
      .get(id)!;
    broadcast(`talk:${q.talk_id}`, { type: 'question.update', question: { ...updatedQ, vote_count: 0, user_voted: 0 } });
    res.json({ ok: true });
  });

  // DELETE /api/admin/messages/:id — hide message
  adminRouter.delete('/messages/:id', (req, res) => {
    const { db } = req.ctx!;
    const id = Number(req.params.id);
    const m = db.prepare<[number], { id: number; question_id: number }>('SELECT id, question_id FROM question_messages WHERE id = ?').get(id);
    if (!m) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    db.prepare('UPDATE question_messages SET hidden = 1 WHERE id = ?').run(id);
    res.json({ ok: true });
  });

  // POST /api/admin/questions/:id/answered — toggle answered
  adminRouter.post('/questions/:id/answered', (req, res) => {
    const { db } = req.ctx!;
    const id = Number(req.params.id);
    const q = db.prepare<[number], { id: number; talk_id: string; answered: number }>('SELECT id, talk_id, answered FROM questions WHERE id = ?').get(id);
    if (!q) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    const newVal = q.answered ? 0 : 1;
    db.prepare('UPDATE questions SET answered = ? WHERE id = ?').run(newVal, id);

    const updatedQ = db
      .prepare<[number], { id: number; talk_id: string; author_id: number; title: string; created_at: number; hidden: number; answered: number; vote_count: number; user_voted: number; author_alias: string }>(
        `SELECT q.*, COUNT(u.user_id) AS vote_count, 0 AS user_voted, usr.alias AS author_alias
         FROM questions q
         LEFT JOIN upvotes u ON u.question_id = q.id
         JOIN users usr ON usr.id = q.author_id
         WHERE q.id = ?
         GROUP BY q.id`,
      )
      .get(id)!;
    broadcast(`talk:${q.talk_id}`, { type: 'question.update', question: updatedQ });
    broadcast(`question:${id}`, { type: 'question.update', question: updatedQ });
    res.json({ answered: !!newVal });
  });

  // POST /api/admin/users/:alias/ban — toggle ban
  adminRouter.post('/users/:alias/ban', (req, res) => {
    const { db } = req.ctx!;
    const user = db.prepare<[string], { id: number; banned: number }>('SELECT id, banned FROM users WHERE alias = ? COLLATE NOCASE').get(req.params.alias);
    if (!user) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    const newBanned = user.banned ? 0 : 1;
    db.prepare('UPDATE users SET banned = ? WHERE id = ?').run(newBanned, user.id);
    if (newBanned) {
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
    }
    res.json({ banned: !!newBanned });
  });

  const patchAdminUserBody = z.object({
    alias: z.string().min(1).max(64).optional(),
  });

  // PATCH /api/admin/users/:alias — rename
  adminRouter.patch('/users/:alias', (req, res) => {
    const { db } = req.ctx!;
    const user = db.prepare<[string], { id: number; alias: string }>('SELECT id, alias FROM users WHERE alias = ? COLLATE NOCASE').get(req.params.alias);
    if (!user) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    const parsed = patchAdminUserBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_body', issues: parsed.error.issues });
      return;
    }
    if (parsed.data.alias) {
      const collision = db.prepare<[string, number], { id: number }>('SELECT id FROM users WHERE alias = ? COLLATE NOCASE AND id != ?').get(parsed.data.alias, user.id);
      if (collision) {
        res.status(409).json({ error: 'alias_taken' });
        return;
      }
      db.prepare('UPDATE users SET alias = ? WHERE id = ?').run(parsed.data.alias, user.id);
    }
    const updated = db.prepare<[number], { id: number; alias: string; name: string | null; affiliation: string | null; bio: string | null; is_admin: number; banned: number }>('SELECT * FROM users WHERE id = ?').get(user.id)!;
    res.json({ user: updated });
  });

  return adminRouter;
}
