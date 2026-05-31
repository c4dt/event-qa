import { describe, it, expect } from 'vitest';
import { parseConfig } from '../src/config.js';

const baseValid = {
  event: {
    name: 'My Conference 2026',
    place: 'EPFL',
    start: '2026-06-01',
    end: '2026-06-02',
  },
  rooms: [{ id: 'main', name: 'Main Hall' }],
  speakers: [{ id: 'ada', name: 'Ada' }],
  admins: [{ alias: 'admin', password: '$argon2id$v=19$m=65536,t=3,p=4$abc$def' }],
  tracks: [
    {
      id: 'main-track',
      name: 'Main Track',
      talks: [
        {
          id: 'opening',
          title: 'Opening',
          start: '2026-06-01T09:00:00+02:00',
          duration_min: 45,
          speakers: ['ada'],
          room: 'main',
        },
      ],
    },
  ],
};

describe('config', () => {
  it('parses a minimal valid config', () => {
    const cfg = parseConfig(baseValid);
    expect(cfg.event.name).toBe('My Conference 2026');
    expect(cfg.event.timezone).toBe('UTC');
    expect(cfg.ratelimit.posts_per_minute).toBe(10);
  });

  it('rejects unknown room reference', () => {
    const bad = structuredClone(baseValid);
    bad.tracks[0]!.talks[0]!.room = 'nope';
    expect(() => parseConfig(bad)).toThrow(/unknown room/);
  });

  it('rejects unknown speaker reference', () => {
    const bad = structuredClone(baseValid);
    bad.tracks[0]!.talks[0]!.speakers = ['ghost'];
    expect(() => parseConfig(bad)).toThrow(/unknown speaker/);
  });

  it('rejects overlapping talks in the same room', () => {
    const bad = structuredClone(baseValid);
    bad.tracks[0]!.talks.push({
      id: 'second',
      title: 'Second',
      start: '2026-06-01T09:30:00+02:00',
      duration_min: 30,
      speakers: ['ada'],
      room: 'main',
    } as never);
    expect(() => parseConfig(bad)).toThrow(/overlaps/);
  });

  it('allows back-to-back (non-overlapping) talks', () => {
    const ok = structuredClone(baseValid);
    ok.tracks[0]!.talks.push({
      id: 'second',
      title: 'Second',
      start: '2026-06-01T09:45:00+02:00',
      duration_min: 30,
      speakers: ['ada'],
      room: 'main',
    } as never);
    expect(() => parseConfig(ok)).not.toThrow();
  });

  it('requires lowercase admin alias', () => {
    const bad = structuredClone(baseValid);
    bad.admins[0]!.alias = 'Admin';
    expect(() => parseConfig(bad)).toThrow(/lowercase/);
  });

  it('slot must have empty speakers and qa:false', () => {
    const bad = structuredClone(baseValid);
    bad.tracks[0]!.talks.push({
      id: 'lunch',
      type: 'slot',
      title: 'Lunch',
      start: '2026-06-01T12:00:00+02:00',
      duration_min: 60,
      speakers: ['ada'],
      room: 'main',
    } as never);
    expect(() => parseConfig(bad)).toThrow(/empty speakers/);
  });

  it('rejects duplicate talk id', () => {
    const bad = structuredClone(baseValid);
    bad.tracks[0]!.talks.push({
      id: 'opening',
      title: 'Dup',
      start: '2026-06-01T15:00:00+02:00',
      duration_min: 30,
      speakers: ['ada'],
      room: 'main',
    } as never);
    expect(() => parseConfig(bad)).toThrow(/duplicate talk/);
  });
});
