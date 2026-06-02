import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { openDb, type DB } from '../src/db.js';
import { Auth } from '../src/auth.js';
import { RateLimiter } from '../src/ratelimit.js';
import type { EventConfig } from '../src/config.js';

const cfg: EventConfig = {
  event: {
    name: 'Test Conf',
    place: 'EPFL',
    start: '2026-06-01',
    end: '2026-06-02',
    timezone: 'UTC',
  },
  rooms: [{ id: 'main', name: 'Main Hall' }],
  speakers: [{ id: 'ada', name: 'Ada' }],
  admins: [],
  tracks: [
    {
      id: 't1',
      name: 'Track 1',
      talks: [
        {
          id: 'talk1',
          type: 'talk',
          title: 'Hello World',
          start: '2026-06-01T09:00:00Z',
          duration_min: 30,
          speakers: ['ada'],
          room: 'main',
        },
        {
          id: 'talk2',
          type: 'slot',
          title: 'Lunch',
          start: '2026-06-01T12:00:00Z',
          duration_min: 60,
          speakers: [],
          room: 'main',
          qa: false,
        },
      ],
    },
  ],
  ratelimit: { posts_per_minute: 100 },
};

let db: DB;
let app: ReturnType<typeof createApp>;
let tokenAlice: string;
let tokenBob: string;

beforeEach(async () => {
  db = openDb(':memory:');
  const auth = new Auth(db);
  app = createApp({ db, cfg, auth, ratelimit: new RateLimiter(100) });

  const resAlice = await request(app).post('/api/auth/login').send({ alias: 'alice' });
  tokenAlice = resAlice.body.token as string;
  const resBob = await request(app).post('/api/auth/login').send({ alias: 'bob' });
  tokenBob = resBob.body.token as string;
});

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

// ─── questions ────────────────────────────────────────────────────────────────

describe('questions', () => {
  it('GET /api/talks/:id/questions returns empty list', async () => {
    const r = await request(app).get('/api/talks/talk1/questions').set(auth(tokenAlice));
    expect(r.status).toBe(200);
    expect(r.body.questions).toEqual([]);
  });

  it('POST creates a question and it appears in list', async () => {
    const post = await request(app)
      .post('/api/talks/talk1/questions')
      .set(auth(tokenAlice))
      .send({ title: 'What is the answer?' });
    expect(post.status).toBe(201);
    expect(post.body.question.title).toBe('What is the answer?');

    const list = await request(app).get('/api/talks/talk1/questions').set(auth(tokenAlice));
    expect(list.body.questions).toHaveLength(1);
    expect(list.body.questions[0].title).toBe('What is the answer?');
  });

  it('POST to unknown talk is 404', async () => {
    const r = await request(app)
      .post('/api/talks/nope/questions')
      .set(auth(tokenAlice))
      .send({ title: 'x' });
    expect(r.status).toBe(404);
  });

  it('GET /api/questions/:id returns question + messages', async () => {
    const post = await request(app)
      .post('/api/talks/talk1/questions')
      .set(auth(tokenAlice))
      .send({ title: 'Q?' });
    const id = post.body.question.id as number;

    const r = await request(app).get(`/api/questions/${id}`).set(auth(tokenAlice));
    expect(r.status).toBe(200);
    expect(r.body.question.id).toBe(id);
    expect(r.body.messages).toEqual([]);
  });

  it('POST message appears on GET', async () => {
    const post = await request(app)
      .post('/api/talks/talk1/questions')
      .set(auth(tokenAlice))
      .send({ title: 'Q?' });
    const id = post.body.question.id as number;

    const msg = await request(app)
      .post(`/api/questions/${id}/messages`)
      .set(auth(tokenBob))
      .send({ body: 'Good question!' });
    expect(msg.status).toBe(201);

    const r = await request(app).get(`/api/questions/${id}`).set(auth(tokenAlice));
    expect(r.body.messages).toHaveLength(1);
    expect(r.body.messages[0].body).toBe('Good question!');
  });

  it('upvote toggle increases/decreases count', async () => {
    const post = await request(app)
      .post('/api/talks/talk1/questions')
      .set(auth(tokenAlice))
      .send({ title: 'Q?' });
    const id = post.body.question.id as number;

    const up = await request(app).post(`/api/questions/${id}/upvote`).set(auth(tokenBob));
    expect(up.status).toBe(200);
    expect(up.body.upvoted).toBe(true);
    expect(up.body.vote_count).toBe(1);

    const down = await request(app).post(`/api/questions/${id}/upvote`).set(auth(tokenBob));
    expect(down.body.upvoted).toBe(false);
    expect(down.body.vote_count).toBe(0);
  });

  it('read marks question as read', async () => {
    const post = await request(app)
      .post('/api/talks/talk1/questions')
      .set(auth(tokenAlice))
      .send({ title: 'Q?' });
    const id = post.body.question.id as number;
    const r = await request(app).post(`/api/questions/${id}/read`).set(auth(tokenAlice));
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
  });
});

// ─── DMs ─────────────────────────────────────────────────────────────────────

describe('dms', () => {
  it('GET /api/dm/:alias returns empty history', async () => {
    const r = await request(app).get('/api/dm/bob').set(auth(tokenAlice));
    expect(r.status).toBe(200);
    expect(r.body.messages).toEqual([]);
  });

  it('POST sends a DM and it appears in history', async () => {
    const send = await request(app)
      .post('/api/dm/bob')
      .set(auth(tokenAlice))
      .send({ body: 'Hey Bob!' });
    expect(send.status).toBe(201);

    const r = await request(app).get('/api/dm/alice').set(auth(tokenBob));
    expect(r.body.messages).toHaveLength(1);
    expect(r.body.messages[0].body).toBe('Hey Bob!');
  });

  it('POST to unknown user is 404', async () => {
    const r = await request(app).post('/api/dm/ghost').set(auth(tokenAlice)).send({ body: 'hi' });
    expect(r.status).toBe(404);
  });

  it('POST dm/read succeeds', async () => {
    const r = await request(app).post('/api/dm/bob/read').set(auth(tokenAlice));
    expect(r.status).toBe(200);
  });
});

// ─── unread ───────────────────────────────────────────────────────────────────

describe('unread', () => {
  it('returns zeros when nothing happened', async () => {
    const r = await request(app).get('/api/unread').set(auth(tokenAlice));
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ dms: {}, questions: {} });
  });

  it('shows unread DM count', async () => {
    await request(app).post('/api/dm/alice').set(auth(tokenBob)).send({ body: 'hello' });
    const r = await request(app).get('/api/unread').set(auth(tokenAlice));
    expect(r.body.dms['bob']).toBe(1);
  });

  it('unread count goes to zero after read', async () => {
    await request(app).post('/api/dm/alice').set(auth(tokenBob)).send({ body: 'hello' });
    await request(app).post('/api/dm/bob/read').set(auth(tokenAlice));
    const r = await request(app).get('/api/unread').set(auth(tokenAlice));
    expect(r.body.dms['bob']).toBeUndefined();
  });
});

// ─── users ────────────────────────────────────────────────────────────────────

describe('users', () => {
  it('GET /api/users lists users', async () => {
    const r = await request(app).get('/api/users').set(auth(tokenAlice));
    expect(r.status).toBe(200);
    expect(r.body.users.length).toBeGreaterThanOrEqual(2);
    expect(r.body.users.some((u: { alias: string }) => u.alias === 'alice')).toBe(true);
  });

  it('GET /api/users/:alias returns profile', async () => {
    const r = await request(app).get('/api/users/bob').set(auth(tokenAlice));
    expect(r.status).toBe(200);
    expect(r.body.user.alias).toBe('bob');
    expect(Array.isArray(r.body.questions)).toBe(true);
  });

  it('GET /api/users/:alias 404 for unknown', async () => {
    const r = await request(app).get('/api/users/ghost').set(auth(tokenAlice));
    expect(r.status).toBe(404);
  });
});

// ─── PATCH /api/me ────────────────────────────────────────────────────────────

describe('PATCH /api/me', () => {
  it('updates display name', async () => {
    const r = await request(app)
      .patch('/api/me')
      .set(auth(tokenAlice))
      .send({ name: 'Alice Smith' });
    expect(r.status).toBe(200);
    expect(r.body.user.name).toBe('Alice Smith');
  });

  it('rejects duplicate alias', async () => {
    const r = await request(app).patch('/api/me').set(auth(tokenAlice)).send({ alias: 'bob' });
    expect(r.status).toBe(409);
  });

  it('renames alias successfully', async () => {
    const r = await request(app).patch('/api/me').set(auth(tokenAlice)).send({ alias: 'alice2' });
    expect(r.status).toBe(200);
    expect(r.body.user.alias).toBe('alice2');
  });
});

// ─── admin ───────────────────────────────────────────────────────────────────

describe('admin routes', () => {
  let adminToken: string;

  beforeEach(() => {
    // Insert admin user with a known session token directly (bypass password requirement)
    const now = Date.now();
    db.prepare(
      `INSERT INTO users (alias, password_hash, created_at, is_admin)
       VALUES ('admin1', NULL, ?, 1)`,
    ).run(now);
    const adminUser = db.prepare<[string], { id: number }>('SELECT id FROM users WHERE alias = ?').get('admin1')!;
    const token = 'admin-test-token-fixed';
    db.prepare(
      'INSERT INTO sessions (token, user_id, created_at, expires_at, last_seen) VALUES (?, ?, ?, ?, ?)',
    ).run(token, adminUser.id, now, now + 86400_000, now);
    adminToken = token;
  });

  it('non-admin gets 403', async () => {
    const post = await request(app)
      .post('/api/talks/talk1/questions')
      .set(auth(tokenAlice))
      .send({ title: 'Q' });
    const id = post.body.question.id as number;
    const r = await request(app).delete(`/api/admin/questions/${id}`).set(auth(tokenAlice));
    expect(r.status).toBe(403);
  });

  it('admin can hide question', async () => {
    const post = await request(app)
      .post('/api/talks/talk1/questions')
      .set(auth(tokenAlice))
      .send({ title: 'Q' });
    const id = post.body.question.id as number;
    const r = await request(app).delete(`/api/admin/questions/${id}`).set(auth(adminToken));
    expect(r.status).toBe(200);

    const list = await request(app).get('/api/talks/talk1/questions').set(auth(tokenAlice));
    expect(list.body.questions).toHaveLength(0);
  });

  it('admin still sees hidden questions and can unhide them', async () => {
    const post = await request(app)
      .post('/api/talks/talk1/questions')
      .set(auth(tokenAlice))
      .send({ title: 'Q' });
    const id = post.body.question.id as number;
    await request(app).delete(`/api/admin/questions/${id}`).set(auth(adminToken));

    const adminList = await request(app).get('/api/talks/talk1/questions').set(auth(adminToken));
    expect(adminList.body.questions).toHaveLength(1);
    expect(adminList.body.questions[0].hidden).toBe(1);

    const adminDetail = await request(app).get(`/api/questions/${id}`).set(auth(adminToken));
    expect(adminDetail.status).toBe(200);
    expect(adminDetail.body.question.hidden).toBe(1);

    const aliceDetail = await request(app).get(`/api/questions/${id}`).set(auth(tokenAlice));
    expect(aliceDetail.status).toBe(404);

    const unhide = await request(app).post(`/api/admin/questions/${id}/unhide`).set(auth(adminToken));
    expect(unhide.status).toBe(200);

    const aliceListAfter = await request(app).get('/api/talks/talk1/questions').set(auth(tokenAlice));
    expect(aliceListAfter.body.questions).toHaveLength(1);
    expect(aliceListAfter.body.questions[0].hidden).toBe(0);
  });

  it('non-admin cannot unhide question', async () => {
    const post = await request(app)
      .post('/api/talks/talk1/questions')
      .set(auth(tokenAlice))
      .send({ title: 'Q' });
    const id = post.body.question.id as number;
    await request(app).delete(`/api/admin/questions/${id}`).set(auth(adminToken));
    const r = await request(app).post(`/api/admin/questions/${id}/unhide`).set(auth(tokenAlice));
    expect(r.status).toBe(403);
  });

  it('admin can toggle answered', async () => {
    const post = await request(app)
      .post('/api/talks/talk1/questions')
      .set(auth(tokenAlice))
      .send({ title: 'Q' });
    const id = post.body.question.id as number;
    const r = await request(app).post(`/api/admin/questions/${id}/answered`).set(auth(adminToken));
    expect(r.status).toBe(200);
    expect(r.body.answered).toBe(true);
  });

  it('admin can ban user', async () => {
    const r = await request(app).post('/api/admin/users/bob/ban').set(auth(adminToken));
    expect(r.status).toBe(200);
    expect(r.body.banned).toBe(true);

    const me = await request(app).get('/api/me').set(auth(tokenBob));
    expect(me.status).toBe(401);
  });

  it('admin can hide message', async () => {
    const post = await request(app)
      .post('/api/talks/talk1/questions')
      .set(auth(tokenAlice))
      .send({ title: 'Q' });
    const id = post.body.question.id as number;
    const msgRes = await request(app)
      .post(`/api/questions/${id}/messages`)
      .set(auth(tokenBob))
      .send({ body: 'hi' });
    const msgId = msgRes.body.message.id as number;
    const r = await request(app).delete(`/api/admin/messages/${msgId}`).set(auth(adminToken));
    expect(r.status).toBe(200);

    const q = await request(app).get(`/api/questions/${id}`).set(auth(tokenAlice));
    expect(q.body.messages).toHaveLength(0);
  });
});
