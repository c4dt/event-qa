// Mirrors the public shapes returned by the backend. Keep in sync by hand for v1.

export type PublicUser = {
  id: number;
  alias: string;
  name: string | null;
  affiliation: string | null;
  bio: string | null;
  is_admin: boolean;
};

export type UserWithActivity = PublicUser & {
  last_seen: number | null;
  question_count?: number;
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

export type Question = {
  id: number;
  talk_id: string;
  author_id: number;
  author_alias: string;
  title: string;
  created_at: number;
  hidden: number;
  answered: number;
  vote_count: number;
  user_voted: number;
  message_count: number;
};

export type QuestionMessage = {
  id: number;
  question_id: number;
  author_id: number;
  author_alias: string;
  body: string;
  created_at: number;
  hidden: number;
};

export type DmMessage = {
  id: number;
  sender_id: number;
  sender_alias: string;
  body: string;
  created_at: number;
};

export type LoginInput = {
  alias: string;
  password?: string;
  name?: string;
  affiliation?: string;
  bio?: string;
};

export type ApiError = { error: string; issues?: unknown };

export type UnreadCounts = {
  dms: Record<string, number>;
  questions: Record<string, number>;
};
