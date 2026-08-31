import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from './context.js';
import type { EventConfig } from '../config.js';
import type { WebSocketServer } from 'ws';

// Chat is independent of the Q&A system: every talk has its own group chat
// room, and the general room is the union of all of them plus messages sent
// directly to it. Talk rooms are namespaced in the DB ("talk:<id>") so a
// literal talk id can never collide with the "general" room.
const GENERAL_ROOM = 'general';
const talkRoomKey = (talkId: string) => `talk:${talkId}`;
const TALK_ROOM_PREFIX = 'talk:';

export type ChatFeedItem = {
  id: number;
  source: 'general' | 'talk' | 'question';
  author_id: number;
  author_alias: string;
  body: string;
  created_at: number;
  talk_id?: string;
  talk_title?: string;
  question_id?: number;
  question_title?: string;
};

type MessageRow = { id: number; room: string; author_id: number; body: string; created_at: number; author_alias: string };

type QuestionMessageRow = {
  id: number;
  author_id: number;
  author_alias: string;
  body: string;
  created_at: number;
  question_id: number;
  talk_id: string;
  question_title: string;
};

function talkTitle(cfg: EventConfig, talkId: string): string {
  return cfg.tracks.flatMap((tr) => tr.talks).find((t) => t.id === talkId)?.title ?? talkId;
}

// Q&A replies bubble up into their talk's chat and into the general feed —
// used both when building those feeds and when broadcasting a new reply.
export function chatItemFromQuestionMessage(row: QuestionMessageRow, cfg: EventConfig): ChatFeedItem {
  return {
    id: row.id,
    source: 'question',
    author_id: row.author_id,
    author_alias: row.author_alias,
    body: row.body,
    created_at: row.created_at,
    talk_id: row.talk_id,
    talk_title: talkTitle(cfg, row.talk_id),
    question_id: row.question_id,
    question_title: row.question_title,
  };
}

const questionMessageSelect = `SELECT m.id, m.author_id, u.alias AS author_alias, m.body, m.created_at,
     q.id AS question_id, q.talk_id, q.title AS question_title
   FROM question_messages m
   JOIN questions q ON q.id = m.question_id
   JOIN users u ON u.id = m.author_id`;

export function makeRoomsRouter(wss?: WebSocketServer) {
  function broadcast(channel: string, payload: unknown) {
    if (!wss) return;
    const msg = JSON.stringify(payload);
    for (const client of wss.clients as Set<{ readyState: number; channels?: Set<string>; send: (s: string) => void }>) {
      if (client.readyState === 1 && client.channels?.has(channel)) {
        client.send(msg);
      }
    }
  }

  function rowToItem(row: MessageRow, cfg: EventConfig): ChatFeedItem {
    const base = {
      id: row.id,
      author_id: row.author_id,
      author_alias: row.author_alias,
      body: row.body,
      created_at: row.created_at,
    };
    if (row.room === GENERAL_ROOM) {
      return { ...base, source: 'general' };
    }
    const talkId = row.room.slice(TALK_ROOM_PREFIX.length);
    return { ...base, source: 'talk', talk_id: talkId, talk_title: talkTitle(cfg, talkId) };
  }

  const roomsRouter: Router = Router();
  roomsRouter.use(requireAuth);

  const messageSelect = `SELECT m.id, m.room, m.author_id, m.body, m.created_at, u.alias AS author_alias
     FROM room_messages m JOIN users u ON u.id = m.author_id`;

  // GET /api/rooms/general — every room's messages plus every talk's Q&A
  // replies, merged and time-sorted.
  roomsRouter.get('/general', (req, res) => {
    const { db, cfg } = req.ctx!;
    const roomRows = db.prepare<[], MessageRow>(`${messageSelect} WHERE m.hidden = 0 ORDER BY m.created_at ASC`).all();
    const questionRows = db
      .prepare<[], QuestionMessageRow>(`${questionMessageSelect} WHERE m.hidden = 0 AND q.hidden = 0 ORDER BY m.created_at ASC`)
      .all();
    const messages: ChatFeedItem[] = [
      ...roomRows.map((r) => rowToItem(r, cfg)),
      ...questionRows.map((r) => chatItemFromQuestionMessage(r, cfg)),
    ].sort((a, b) => a.created_at - b.created_at);
    res.json({ messages });
  });

  const sendBody = z.object({ body: z.string().min(1).max(2048) });

  // POST /api/rooms/general
  roomsRouter.post('/general', (req, res) => {
    const { db, cfg, ratelimit } = req.ctx!;
    const user = req.user!;

    const parsed = sendBody.safeParse(req.body);
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
      .prepare('INSERT INTO room_messages (room, author_id, body, created_at) VALUES (?, ?, ?, ?)')
      .run(GENERAL_ROOM, user.id, parsed.data.body, now);
    const msgId = Number(info.lastInsertRowid);
    const row = db.prepare<[number], MessageRow>(`${messageSelect} WHERE m.id = ?`).get(msgId)!;

    const message = rowToItem(row, cfg);
    broadcast('room:general', { type: 'room.message', room: GENERAL_ROOM, message });
    res.status(201).json({ message });
  });

  // GET /api/rooms/talks/:talkId — this talk's own chat plus its Q&A replies.
  roomsRouter.get('/talks/:talkId', (req, res) => {
    const { db, cfg } = req.ctx!;
    const { talkId } = req.params;
    const talk = cfg.tracks.flatMap((tr) => tr.talks).find((t) => t.id === talkId);
    if (!talk) {
      res.status(404).json({ error: 'talk_not_found' });
      return;
    }

    const roomRows = db
      .prepare<[string], MessageRow>(`${messageSelect} WHERE m.room = ? AND m.hidden = 0 ORDER BY m.created_at ASC`)
      .all(talkRoomKey(talkId!));
    const questionRows = db
      .prepare<[string], QuestionMessageRow>(
        `${questionMessageSelect} WHERE q.talk_id = ? AND m.hidden = 0 AND q.hidden = 0 ORDER BY m.created_at ASC`,
      )
      .all(talkId!);
    const messages: ChatFeedItem[] = [
      ...roomRows.map((r) => rowToItem(r, cfg)),
      ...questionRows.map((r) => chatItemFromQuestionMessage(r, cfg)),
    ].sort((a, b) => a.created_at - b.created_at);
    res.json({ messages });
  });

  // POST /api/rooms/talks/:talkId
  roomsRouter.post('/talks/:talkId', (req, res) => {
    const { db, cfg, ratelimit } = req.ctx!;
    const { talkId } = req.params;
    const user = req.user!;

    const talk = cfg.tracks.flatMap((tr) => tr.talks).find((t) => t.id === talkId);
    if (!talk) {
      res.status(404).json({ error: 'talk_not_found' });
      return;
    }

    const parsed = sendBody.safeParse(req.body);
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
      .prepare('INSERT INTO room_messages (room, author_id, body, created_at) VALUES (?, ?, ?, ?)')
      .run(talkRoomKey(talkId!), user.id, parsed.data.body, now);
    const msgId = Number(info.lastInsertRowid);
    const row = db.prepare<[number], MessageRow>(`${messageSelect} WHERE m.id = ?`).get(msgId)!;

    const message = rowToItem(row, cfg);
    // Talk pages already subscribe to `talk:<id>` for Q&A events; reuse it for chat too.
    broadcast(`talk:${talkId}`, { type: 'chat.message', talkId, message });
    broadcast('room:general', { type: 'room.message', room: GENERAL_ROOM, message });
    res.status(201).json({ message });
  });

  return { roomsRouter };
}
