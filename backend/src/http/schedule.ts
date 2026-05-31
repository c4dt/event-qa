import { Router } from 'express';

export const eventRouter: Router = Router();

eventRouter.get('/event', (req, res) => {
  const { event } = req.ctx!.cfg;
  res.json({
    name: event.name,
    place: event.place,
    start: event.start,
    end: event.end,
    info: event.info ?? null,
    timezone: event.timezone,
  });
});

eventRouter.get('/schedule', (req, res) => {
  const { rooms, speakers, tracks } = req.ctx!.cfg;
  res.json({ rooms, speakers, tracks });
});
