import { Router } from 'express';
import { getBoolSetting } from '../settings.js';

export const eventRouter: Router = Router();

eventRouter.get('/event', (req, res) => {
  const { db, cfg } = req.ctx!;
  const { event } = cfg;
  res.json({
    name: event.name,
    place: event.place,
    start: event.start,
    end: event.end,
    info: event.info ?? null,
    timezone: event.timezone,
    repo_url: event.repo_url ?? null,
    allow_non_admin_questions: getBoolSetting(db, 'allow_non_admin_questions'),
  });
});

eventRouter.get('/schedule', (req, res) => {
  const { rooms, speakers, tracks } = req.ctx!.cfg;
  res.json({ rooms, speakers, tracks });
});
