import { readFileSync } from 'node:fs';
import yaml from 'js-yaml';
import { z } from 'zod';

const slug = z
  .string()
  .min(1)
  .regex(/^[a-z0-9][a-z0-9-]*$/i, 'must be a slug (alphanumeric and hyphens)');

const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD');

const isoDateTime = z
  .string()
  .refine((s) => !Number.isNaN(Date.parse(s)), 'must be a parseable ISO datetime');

const roomSchema = z.object({
  id: slug,
  name: z.string().min(1),
  description: z.string().optional(),
});

const speakerSchema = z.object({
  id: slug,
  name: z.string().min(1),
  bio: z.string().optional(),
  affiliation: z.string().optional(),
});

const adminSchema = z.object({
  alias: z.string().min(1),
  password: z.string().min(1, 'argon2id hash required'),
});

const talkSchema = z.object({
  id: slug,
  type: z.enum(['talk', 'slot']).default('talk'),
  title: z.string().min(1),
  description: z.string().optional(),
  start: isoDateTime,
  duration_min: z.number().int().positive(),
  speakers: z.array(slug).default([]),
  room: slug,
  qa: z.boolean().optional(),
});

const trackSchema = z.object({
  id: slug,
  name: z.string().min(1),
  talks: z.array(talkSchema),
});

const eventMetaSchema = z.object({
  name: z.string().min(1),
  place: z.string().min(1),
  start: dateOnly,
  end: dateOnly,
  info: z.string().optional(),
  timezone: z.string().default('UTC'),
});

const ratelimitSchema = z
  .object({
    posts_per_minute: z.number().int().positive().default(10),
  })
  .default({ posts_per_minute: 10 });

export const eventConfigSchema = z
  .object({
    event: eventMetaSchema,
    rooms: z.array(roomSchema).default([]),
    speakers: z.array(speakerSchema).default([]),
    admins: z.array(adminSchema).default([]),
    tracks: z.array(trackSchema).default([]),
    ratelimit: ratelimitSchema,
  })
  .superRefine((cfg, ctx) => {
    const roomIds = new Set(cfg.rooms.map((r) => r.id));
    const speakerIds = new Set(cfg.speakers.map((s) => s.id));
    const adminAliases = new Set<string>();
    const talkIds = new Set<string>();

    for (const a of cfg.admins) {
      const lower = a.alias.toLowerCase();
      if (lower !== a.alias) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `admin alias '${a.alias}' must be lowercase`,
          path: ['admins'],
        });
      }
      if (adminAliases.has(lower)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `duplicate admin alias '${a.alias}'`,
          path: ['admins'],
        });
      }
      adminAliases.add(lower);
    }

    type Interval = { start: number; end: number; talkId: string };
    const byRoom = new Map<string, Interval[]>();

    cfg.tracks.forEach((track, ti) => {
      track.talks.forEach((talk, qi) => {
        if (talkIds.has(talk.id)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `duplicate talk id '${talk.id}'`,
            path: ['tracks', ti, 'talks', qi, 'id'],
          });
        }
        talkIds.add(talk.id);

        if (!roomIds.has(talk.room)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `talk '${talk.id}' references unknown room '${talk.room}'`,
            path: ['tracks', ti, 'talks', qi, 'room'],
          });
        }

        for (const sp of talk.speakers) {
          if (!speakerIds.has(sp)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `talk '${talk.id}' references unknown speaker '${sp}'`,
              path: ['tracks', ti, 'talks', qi, 'speakers'],
            });
          }
        }

        if (talk.type === 'slot') {
          if (talk.speakers.length > 0) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `slot '${talk.id}' must have empty speakers`,
              path: ['tracks', ti, 'talks', qi, 'speakers'],
            });
          }
          if (talk.qa === true) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `slot '${talk.id}' must have qa:false`,
              path: ['tracks', ti, 'talks', qi, 'qa'],
            });
          }
        } else if (talk.speakers.length === 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `talk '${talk.id}' must have at least one speaker`,
            path: ['tracks', ti, 'talks', qi, 'speakers'],
          });
        }

        const start = Date.parse(talk.start);
        const end = start + talk.duration_min * 60_000;
        const intervals = byRoom.get(talk.room) ?? [];
        for (const other of intervals) {
          if (start < other.end && end > other.start) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `talk '${talk.id}' overlaps with '${other.talkId}' in room '${talk.room}'`,
              path: ['tracks', ti, 'talks', qi],
            });
          }
        }
        intervals.push({ start, end, talkId: talk.id });
        byRoom.set(talk.room, intervals);
      });
    });
  });

export type EventConfig = z.infer<typeof eventConfigSchema>;
export type Talk = z.infer<typeof talkSchema>;
export type Track = z.infer<typeof trackSchema>;
export type Room = z.infer<typeof roomSchema>;
export type Speaker = z.infer<typeof speakerSchema>;

export function parseConfig(raw: unknown): EventConfig {
  return eventConfigSchema.parse(raw);
}

export function loadConfig(path: string): EventConfig {
  const text = readFileSync(path, 'utf8');
  const parsed = yaml.load(text);
  return parseConfig(parsed);
}

export function talkQaEnabled(talk: Talk): boolean {
  if (talk.type === 'slot') return false;
  return talk.qa ?? true;
}
