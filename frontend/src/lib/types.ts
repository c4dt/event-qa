// Mirrors the public shapes returned by the backend (see backend/src/config.ts
// and backend/src/auth.ts). Keep in sync by hand for v1.

export type PublicUser = {
  id: number;
  alias: string;
  name: string | null;
  affiliation: string | null;
  bio: string | null;
  is_admin: boolean;
};

export type EventMeta = {
  name: string;
  place: string;
  start: string;
  end: string;
  info: string | null;
  timezone: string;
};

export type Room = { id: string; name: string; description?: string };
export type Speaker = { id: string; name: string; bio?: string; affiliation?: string };

export type Talk = {
  id: string;
  type: 'talk' | 'slot';
  title: string;
  description?: string;
  start: string;
  duration_min: number;
  speakers: string[];
  room: string;
  qa?: boolean;
};

export type Track = { id: string; name: string; talks: Talk[] };
export type Schedule = { rooms: Room[]; speakers: Speaker[]; tracks: Track[] };

export type LoginInput = {
  alias: string;
  password?: string;
  name?: string;
  affiliation?: string;
  bio?: string;
};

export type ApiError = { error: string; issues?: unknown };
