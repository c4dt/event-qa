import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from './context.js';
import { toPublicUser } from '../auth.js';

const loginBody = z.object({
  alias: z.string().min(1).max(64),
  password: z.string().min(1).max(256).optional(),
  name: z.string().max(128).optional(),
  affiliation: z.string().max(128).optional(),
  bio: z.string().max(2048).optional(),
});

export const authRouter: Router = Router();

authRouter.post('/login', async (req, res) => {
  const parsed = loginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_body', issues: parsed.error.issues });
    return;
  }
  const result = await req.ctx!.auth.login(parsed.data);
  if (!result.ok) {
    const status =
      result.code === 'alias_busy'
        ? 409
        : result.code === 'banned'
          ? 403
          : result.code === 'bad_password'
            ? 401
            : 400;
    res.status(status).json({ error: result.code });
    return;
  }
  res.json({ token: result.token, user: result.user });
});

authRouter.post('/logout', requireAuth, (req, res) => {
  req.ctx!.auth.logout(req.token!);
  res.json({ ok: true });
});

export const meRouter: Router = Router();
meRouter.use(requireAuth);

meRouter.get('/', (req, res) => {
  res.json({ user: toPublicUser(req.user!) });
});

const patchMeBody = z.object({
  alias: z.string().min(1).max(64).optional(),
  name: z.string().max(128).nullable().optional(),
  affiliation: z.string().max(128).nullable().optional(),
  bio: z.string().max(2048).nullable().optional(),
  password: z.string().min(1).max(256).nullable().optional(),
});

meRouter.patch('/', async (req, res) => {
  const { db, auth } = req.ctx!;
  const me = req.user!;
  const parsed = patchMeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_body', issues: parsed.error.issues });
    return;
  }
  const { alias, name, affiliation, bio, password } = parsed.data;
  if (alias !== undefined) {
    const collision = db
      .prepare<[string, number], { id: number }>('SELECT id FROM users WHERE alias = ? COLLATE NOCASE AND id != ?')
      .get(alias, me.id);
    if (collision) {
      res.status(409).json({ error: 'alias_taken' });
      return;
    }
    db.prepare('UPDATE users SET alias = ? WHERE id = ?').run(alias, me.id);
  }
  if (name !== undefined) db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name, me.id);
  if (affiliation !== undefined) db.prepare('UPDATE users SET affiliation = ? WHERE id = ?').run(affiliation, me.id);
  if (bio !== undefined) db.prepare('UPDATE users SET bio = ? WHERE id = ?').run(bio, me.id);
  if (password !== undefined) {
    const argon2 = await import('argon2');
    const hash = password ? await argon2.default.hash(password, { type: argon2.default.argon2id }) : null;
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, me.id);
  }
  const updated = auth.getUserById(me.id)!;
  res.json({ user: toPublicUser(updated) });
});
