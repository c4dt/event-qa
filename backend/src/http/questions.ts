import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from './context.js';
import type { WebSocketServer } from 'ws';

export function makeQuestionsRouters(wss?: WebSocketServer) {
  function broadcast(channel: string, payload: unknown) {
    if (!wss) return;
    const msg = JSON.stringify(payload);
    for (const client of wss.clients as Set<{ readyState: number; channels?: Set<string>; send: (s: string) => void }>) {
      if (client.readyState === 1 && client.channels?.has(channel)) {
        client.send(msg);
      }
    }
  }

  const talksRouter: Router = Router();
  talksRouter.use(requireAuth);

  // GET /api/talks/:talkId/questions
  talksRouter.get('/:talkId/questions', (req, res) => {
    const { db } = req.ctx!;
    const { talkId } = req.params;
    const userId = req.user!.id;
    const questions = db
      .prepare<[number, string], {
        id: number; talk_id: string; author_id: number; title: string;
        created_at: number; hidden: number; answered: number;
        vote_count: number; user_voted: number; author_alias: string; message_count: number;
      }>(
        `SELECT q.*, COUNT(DISTINCT u.user_id) AS vote_count,
                MAX(CASE WHEN u.user_id = ? THEN 1 ELSE 0 END) AS user_voted,
                usr.alias AS author_alias,
                (SELECT COUNT(*) FROM question_messages m WHERE m.question_id = q.id AND m.hidden = 0) AS message_count
         FROM questions q
         LEFT JOIN upvotes u ON u.question_id = q.id
         JOIN users usr ON usr.id = q.author_id
         WHERE q.talk_id = ? AND q.hidden = 0
         GROUP BY q.id
         ORDER BY vote_count DESC, q.created_at ASC`,
      )
      .all(userId, talkId);
    res.json({ questions });
  });

  const createQuestionBody = z.object({
    title: z.string().min(1).max(512),
  });

  // POST /api/talks/:talkId/questions
  talksRouter.post('/:talkId/questions', (req, res) => {
    const { db, cfg, ratelimit } = req.ctx!;
    const { talkId } = req.params;
    const user = req.user!;

    const allTalks = cfg.tracks.flatMap((tr) => tr.talks);
    const talk = allTalks.find((t) => t.id === talkId);
    if (!talk) {
      res.status(404).json({ error: 'talk_not_found' });
      return;
    }

    const parsed = createQuestionBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_body', issues: parsed.error.issues });
      return;
    }

    if (!ratelimit.consume(user.id)) {
      res.status(429).json({ error: 'rate_limited' });
      return;
    }

    const now = Date.now();
    const info = db
      .prepare('INSERT INTO questions (talk_id, author_id, title, created_at) VALUES (?, ?, ?, ?)')
      .run(talkId, user.id, parsed.data.title, now);
    const id = Number(info.lastInsertRowid);
    db.prepare('INSERT OR IGNORE INTO watches (user_id, question_id) VALUES (?, ?)').run(user.id, id);

    const question = db
      .prepare<[number], { id: number; talk_id: string; author_id: number; title: string; created_at: number; hidden: number; answered: number; vote_count: number; user_voted: number; author_alias: string; message_count: number }>(
        `SELECT q.*, 0 AS vote_count, 0 AS user_voted, 0 AS message_count, usr.alias AS author_alias
         FROM questions q JOIN users usr ON usr.id = q.author_id WHERE q.id = ?`,
      )
      .get(id)!;

    broadcast(`talk:${talkId}`, { type: 'question.new', talkId, question });
    res.status(201).json({ question });
  });

  const questionsRouter: Router = Router();
  questionsRouter.use(requireAuth);

  // GET /api/questions/:id
  questionsRouter.get('/:id', (req, res) => {
    const { db } = req.ctx!;
    const id = Number(req.params.id);
    const userId = req.user!.id;

    const question = db
      .prepare<[number, number], { id: number; talk_id: string; author_id: number; title: string; created_at: number; hidden: number; answered: number; vote_count: number; user_voted: number; author_alias: string; message_count: number }>(
        `SELECT q.*, COUNT(DISTINCT u.user_id) AS vote_count,
                MAX(CASE WHEN u.user_id = ? THEN 1 ELSE 0 END) AS user_voted,
                usr.alias AS author_alias,
                (SELECT COUNT(*) FROM question_messages m WHERE m.question_id = q.id AND m.hidden = 0) AS message_count
         FROM questions q
         LEFT JOIN upvotes u ON u.question_id = q.id
         JOIN users usr ON usr.id = q.author_id
         WHERE q.id = ? AND q.hidden = 0
         GROUP BY q.id`,
      )
      .get(userId, id);

    if (!question) {
      res.status(404).json({ error: 'not_found' });
      return;
    }

    const messages = db
      .prepare<[number], { id: number; question_id: number; author_id: number; body: string; created_at: number; hidden: number; author_alias: string }>(
        `SELECT m.*, usr.alias AS author_alias
         FROM question_messages m JOIN users usr ON usr.id = m.author_id
         WHERE m.question_id = ? AND m.hidden = 0
         ORDER BY m.created_at ASC`,
      )
      .all(id);

    db.prepare('INSERT OR IGNORE INTO watches (user_id, question_id) VALUES (?, ?)').run(userId, id);
    res.json({ question, messages });
  });

  const createMessageBody = z.object({
    body: z.string().min(1).max(2048),
  });

  // POST /api/questions/:id/messages
  questionsRouter.post('/:id/messages', (req, res) => {
    const { db, ratelimit } = req.ctx!;
    const id = Number(req.params.id);
    const user = req.user!;

    const question = db
      .prepare<[number], { id: number; talk_id: string; hidden: number }>('SELECT id, talk_id, hidden FROM questions WHERE id = ?')
      .get(id);
    if (!question || question.hidden) {
      res.status(404).json({ error: 'not_found' });
      return;
    }

    const parsed = createMessageBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_body', issues: parsed.error.issues });
      return;
    }

    if (!ratelimit.consume(user.id)) {
      res.status(429).json({ error: 'rate_limited' });
      return;
    }

    const now = Date.now();
    const info = db
      .prepare('INSERT INTO question_messages (question_id, author_id, body, created_at) VALUES (?, ?, ?, ?)')
      .run(id, user.id, parsed.data.body, now);
    const msgId = Number(info.lastInsertRowid);
    db.prepare('INSERT OR IGNORE INTO watches (user_id, question_id) VALUES (?, ?)').run(user.id, id);

    const message = db
      .prepare<[number], { id: number; question_id: number; author_id: number; body: string; created_at: number; hidden: number; author_alias: string }>(
        `SELECT m.*, usr.alias AS author_alias
         FROM question_messages m JOIN users usr ON usr.id = m.author_id WHERE m.id = ?`,
      )
      .get(msgId)!;

    const updatedQuestion = db
      .prepare<[number], { id: number; talk_id: string; author_id: number; title: string; created_at: number; hidden: number; answered: number; vote_count: number; user_voted: number; author_alias: string; message_count: number }>(
        `SELECT q.*, COUNT(DISTINCT u.user_id) AS vote_count, 0 AS user_voted,
                usr.alias AS author_alias,
                (SELECT COUNT(*) FROM question_messages m WHERE m.question_id = q.id AND m.hidden = 0) AS message_count
         FROM questions q
         LEFT JOIN upvotes u ON u.question_id = q.id
         JOIN users usr ON usr.id = q.author_id
         WHERE q.id = ?
         GROUP BY q.id`,
      )
      .get(id)!;

    broadcast(`question:${id}`, { type: 'question.message', questionId: id, message });
    broadcast(`talk:${question.talk_id}`, { type: 'question.update', question: updatedQuestion });
    res.status(201).json({ message });
  });

  // POST /api/questions/:id/upvote (toggle)
  questionsRouter.post('/:id/upvote', (req, res) => {
    const { db } = req.ctx!;
    const id = Number(req.params.id);
    const user = req.user!;

    const question = db
      .prepare<[number], { id: number; talk_id: string; hidden: number }>('SELECT id, talk_id, hidden FROM questions WHERE id = ?')
      .get(id);
    if (!question || question.hidden) {
      res.status(404).json({ error: 'not_found' });
      return;
    }

    const existing = db
      .prepare<[number, number], { question_id: number }>('SELECT question_id FROM upvotes WHERE question_id = ? AND user_id = ?')
      .get(id, user.id);

    if (existing) {
      db.prepare('DELETE FROM upvotes WHERE question_id = ? AND user_id = ?').run(id, user.id);
    } else {
      db.prepare('INSERT OR IGNORE INTO upvotes (question_id, user_id) VALUES (?, ?)').run(id, user.id);
    }

    const { vote_count } = db
      .prepare<[number], { vote_count: number }>('SELECT COUNT(*) AS vote_count FROM upvotes WHERE question_id = ?')
      .get(id)!;

    const updatedQuestion = db
      .prepare<[number, number], { id: number; talk_id: string; author_id: number; title: string; created_at: number; hidden: number; answered: number; vote_count: number; user_voted: number; author_alias: string; message_count: number }>(
        `SELECT q.*, COUNT(DISTINCT u.user_id) AS vote_count,
                MAX(CASE WHEN u.user_id = ? THEN 1 ELSE 0 END) AS user_voted,
                usr.alias AS author_alias,
                (SELECT COUNT(*) FROM question_messages m WHERE m.question_id = q.id AND m.hidden = 0) AS message_count
         FROM questions q
         LEFT JOIN upvotes u ON u.question_id = q.id
         JOIN users usr ON usr.id = q.author_id
         WHERE q.id = ?
         GROUP BY q.id`,
      )
      .get(user.id, id)!;

    broadcast(`talk:${question.talk_id}`, { type: 'question.update', question: updatedQuestion });
    res.json({ upvoted: !existing, vote_count });
  });

  // POST /api/questions/:id/read
  questionsRouter.post('/:id/read', (req, res) => {
    const { db } = req.ctx!;
    const id = Number(req.params.id);
    const user = req.user!;

    db.prepare(
      `INSERT INTO read_markers (user_id, kind, ref, last_read) VALUES (?, 'question', ?, ?)
       ON CONFLICT(user_id, kind, ref) DO UPDATE SET last_read = excluded.last_read`,
    ).run(user.id, String(id), Date.now());

    res.json({ ok: true });
  });

  return { talksRouter, questionsRouter };
}
