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

// PATCH /api/me — profile/alias/password updates: TODO in skeleton.
meRouter.patch('/', (_req, res) => {
  res.status(501).json({ error: 'not_implemented' });
});
