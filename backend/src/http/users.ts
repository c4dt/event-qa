import { Router } from 'express';
import { requireAuth } from './context.js';
import { toPublicUser } from '../auth.js';

export const usersRouter: Router = Router();
usersRouter.use(requireAuth);

// GET /api/users — list with counts + last_seen
// Admins also see banned users (so they can unban them).
usersRouter.get('/', (req, res) => {
  const { db } = req.ctx!;
  const isAdmin = req.user?.is_admin === 1;
  const whereClause = isAdmin ? '' : 'WHERE u.banned = 0';
  const rows = db
    .prepare<[], {
      id: number; alias: string; name: string | null; affiliation: string | null;
      bio: string | null; is_admin: number; banned: number;
      last_seen: number | null; question_count: number;
    }>(
      `SELECT u.id, u.alias, u.name, u.affiliation, u.bio, u.is_admin, u.banned,
              MAX(s.last_seen) AS last_seen,
              COUNT(DISTINCT q.id) AS question_count
       FROM users u
       LEFT JOIN sessions s ON s.user_id = u.id
       LEFT JOIN questions q ON q.author_id = u.id AND q.hidden = 0
       ${whereClause}
       GROUP BY u.id
       ORDER BY u.alias ASC`,
    )
    .all();

  const users = rows.map((r) => ({
    ...toPublicUser(r),
    last_seen: r.last_seen ?? null,
    question_count: r.question_count,
  }));
  res.json({ users });
});

// GET /api/users/:alias — public profile + activity
usersRouter.get('/:alias', (req, res) => {
  const { db } = req.ctx!;
  const row = db
    .prepare<[string], {
      id: number; alias: string; name: string | null; affiliation: string | null;
      bio: string | null; is_admin: number; banned: number; last_seen: number | null;
    }>(
      `SELECT u.id, u.alias, u.name, u.affiliation, u.bio, u.is_admin, u.banned,
              MAX(s.last_seen) AS last_seen
       FROM users u
       LEFT JOIN sessions s ON s.user_id = u.id
       WHERE u.alias = ? COLLATE NOCASE
       GROUP BY u.id`,
    )
    .get(req.params.alias);

  if (!row || row.banned) {
    res.status(404).json({ error: 'not_found' });
    return;
  }

  const questions = db
    .prepare<[number], { id: number; talk_id: string; title: string; created_at: number; vote_count: number }>(
      `SELECT q.id, q.talk_id, q.title, q.created_at, COUNT(u2.user_id) AS vote_count
       FROM questions q
       LEFT JOIN upvotes u2 ON u2.question_id = q.id
       WHERE q.author_id = ? AND q.hidden = 0
       GROUP BY q.id
       ORDER BY q.created_at DESC`,
    )
    .all(row.id);

  res.json({
    user: { ...toPublicUser(row), last_seen: row.last_seen ?? null },
    questions,
  });
});
