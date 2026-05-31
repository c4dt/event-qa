import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { openDb, type DB } from '../src/db.js';
import { Auth } from '../src/auth.js';
import { RateLimiter } from '../src/ratelimit.js';
import type { EventConfig } from '../src/config.js';

const cfg: EventConfig = {
  event: {
    name: 'My Conference 2026',
    place: 'EPFL',
    start: '2026-06-01',
    end: '2026-06-02',
    info: '# Welcome',
    timezone: 'Europe/Zurich',
  },
  rooms: [{ id: 'main', name: 'Main Hall' }],
  speakers: [{ id: 'ada', name: 'Ada' }],
  admins: [],
  tracks: [
    {
      id: 't',
      name: 'Track',
      talks: [
        {
          id: 'k',
          type: 'talk',
          title: 'K',
          start: '2026-06-01T09:00:00+02:00',
          duration_min: 30,
          speakers: ['ada'],
          room: 'main',
        },
      ],
    },
  ],
  ratelimit: { posts_per_minute: 10 },
};

let db: DB;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  db = openDb(':memory:');
  const auth = new Auth(db);
  app = createApp({ db, cfg, auth, ratelimit: new RateLimiter(10) });
});

describe('http /api', () => {
  it('GET /api/health is open', async () => {
    const r = await request(app).get('/api/health');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true });
  });

  it('GET /api/event returns metadata', async () => {
    const r = await request(app).get('/api/event');
    expect(r.status).toBe(200);
    expect(r.body.name).toBe('My Conference 2026');
    expect(r.body.timezone).toBe('Europe/Zurich');
  });

  it('GET /api/me without token is 401', async () => {
    const r = await request(app).get('/api/me');
    expect(r.status).toBe(401);
  });

  it('login -> /api/me round-trip works', async () => {
    const login = await request(app).post('/api/auth/login').send({ alias: 'alice' });
    expect(login.status).toBe(200);
    const token = login.body.token as string;
    const me = await request(app).get('/api/me').set('Authorization', `Bearer ${token}`);
    expect(me.status).toBe(200);
    expect(me.body.user.alias).toBe('alice');
  });

  it('logout invalidates the token', async () => {
    const login = await request(app).post('/api/auth/login').send({ alias: 'bob' });
    const token = login.body.token as string;
    await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${token}`);
    const after = await request(app).get('/api/me').set('Authorization', `Bearer ${token}`);
    expect(after.status).toBe(401);
  });
});
