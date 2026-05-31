import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from './context.js';
import type { WebSocketServer } from 'ws';

export function makeDmsRouters(wss?: WebSocketServer) {
  function broadcast(channel: string, payload: unknown) {
    if (!wss) return;
    const msg = JSON.stringify(payload);
    for (const client of wss.clients as Set<{ readyState: number; channels?: Set<string>; send: (s: string) => void }>) {
      if (client.readyState === 1 && client.channels?.has(channel)) {
        client.send(msg);
      }
    }
  }

  const dmsRouter: Router = Router();
  dmsRouter.use(requireAuth);

  // GET /api/dm/:alias
  dmsRouter.get('/:alias', (req, res) => {
    const { db } = req.ctx!;
    const me = req.user!;
    const peer = db
      .prepare<[string], { id: number; alias: string }>('SELECT id, alias FROM users WHERE alias = ? COLLATE NOCASE')
      .get(req.params.alias);
    if (!peer) {
      res.status(404).json({ error: 'user_not_found' });
      return;
    }

    const [a, b] = me.id < peer.id ? [me.id, peer.id] : [peer.id, me.id];
    const messages = db
      .prepare<[number, number], { id: number; sender_id: number; body: string; created_at: number; sender_alias: string }>(
        `SELECT m.id, m.sender_id, m.body, m.created_at, u.alias AS sender_alias
         FROM dm_messages m JOIN users u ON u.id = m.sender_id
         WHERE m.user_a = ? AND m.user_b = ?
         ORDER BY m.created_at ASC`,
      )
      .all(a, b);

    res.json({ messages, peer: { id: peer.id, alias: peer.alias } });
  });

  const sendDmBody = z.object({
    body: z.string().min(1).max(2048),
  });

  // POST /api/dm/:alias
  dmsRouter.post('/:alias', (req, res) => {
    const { db, ratelimit } = req.ctx!;
    const me = req.user!;
    const peer = db
      .prepare<[string], { id: number; alias: string; banned: number }>('SELECT id, alias, banned FROM users WHERE alias = ? COLLATE NOCASE')
      .get(req.params.alias);
    if (!peer) {
      res.status(404).json({ error: 'user_not_found' });
      return;
    }
    if (peer.id === me.id) {
      res.status(400).json({ error: 'cannot_dm_self' });
      return;
    }

    const parsed = sendDmBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_body', issues: parsed.error.issues });
      return;
    }

    if (!ratelimit.consume(me.id)) {
      res.status(429).json({ error: 'rate_limited' });
      return;
    }

    const [a, b] = me.id < peer.id ? [me.id, peer.id] : [peer.id, me.id];
    const now = Date.now();
    const info = db
      .prepare('INSERT INTO dm_messages (user_a, user_b, sender_id, body, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(a, b, me.id, parsed.data.body, now);
    const msgId = Number(info.lastInsertRowid);

    const message = db
      .prepare<[number], { id: number; sender_id: number; body: string; created_at: number; sender_alias: string }>(
        `SELECT m.id, m.sender_id, m.body, m.created_at, u.alias AS sender_alias
         FROM dm_messages m JOIN users u ON u.id = m.sender_id WHERE m.id = ?`,
      )
      .get(msgId)!;

    broadcast(`dm:${peer.id}`, { type: 'dm.new', peerAlias: me.alias, message });
    broadcast(`dm:${me.id}`, { type: 'dm.new', peerAlias: peer.alias, message });
    res.status(201).json({ message });
  });

  // POST /api/dm/:alias/read
  dmsRouter.post('/:alias/read', (req, res) => {
    const { db } = req.ctx!;
    const me = req.user!;
    const peer = db
      .prepare<[string], { id: number }>('SELECT id FROM users WHERE alias = ? COLLATE NOCASE')
      .get(req.params.alias);
    if (!peer) {
      res.status(404).json({ error: 'user_not_found' });
      return;
    }

    db.prepare(
      `INSERT INTO read_markers (user_id, kind, ref, last_read) VALUES (?, 'dm', ?, ?)
       ON CONFLICT(user_id, kind, ref) DO UPDATE SET last_read = excluded.last_read`,
    ).run(me.id, String(peer.id), Date.now());

    res.json({ ok: true });
  });

  const unreadRouter: Router = Router();
  unreadRouter.use(requireAuth);

  // GET /api/unread
  unreadRouter.get('/', (req, res) => {
    const { db } = req.ctx!;
    const me = req.user!;

    // Unread DMs: messages from peers after last read marker
    const dmRows = db
      .prepare<[number, number, number, number, number, number, number], { peer_id: number; peer_alias: string; count: number }>(
        `SELECT
           CASE WHEN m.user_a = ? THEN m.user_b ELSE m.user_a END AS peer_id,
           u.alias AS peer_alias,
           COUNT(*) AS count
         FROM dm_messages m
         JOIN users u ON u.id = (CASE WHEN m.user_a = ? THEN m.user_b ELSE m.user_a END)
         WHERE (m.user_a = ? OR m.user_b = ?)
           AND m.sender_id != ?
           AND m.created_at > COALESCE(
             (SELECT rm.last_read FROM read_markers rm
              WHERE rm.user_id = ? AND rm.kind = 'dm'
                AND rm.ref = CAST(CASE WHEN m.user_a = ? THEN m.user_b ELSE m.user_a END AS TEXT)),
             0
           )
         GROUP BY peer_id`,
      )
      .all(me.id, me.id, me.id, me.id, me.id, me.id, me.id);

    const dms: Record<string, number> = {};
    for (const row of dmRows) {
      dms[row.peer_alias] = row.count;
    }

    // Unread question messages: watched questions with messages after last read
    const questionRows = db
      .prepare<[number, number, number], { question_id: number; count: number }>(
        `SELECT m.question_id, COUNT(*) AS count
         FROM question_messages m
         JOIN watches w ON w.question_id = m.question_id AND w.user_id = ?
         WHERE m.author_id != ?
           AND m.hidden = 0
           AND m.created_at > COALESCE(
             (SELECT rm.last_read FROM read_markers rm
              WHERE rm.user_id = ? AND rm.kind = 'question'
                AND rm.ref = CAST(m.question_id AS TEXT)),
             0
           )
         GROUP BY m.question_id`,
      )
      .all(me.id, me.id, me.id);

    const questions: Record<string, number> = {};
    for (const row of questionRows) {
      questions[String(row.question_id)] = row.count;
    }

    res.json({ dms, questions });
  });

  return { dmsRouter, unreadRouter };
}
