import type {
  ApiError, EventMeta, LoginInput, PublicUser, Schedule,
  Question, QuestionMessage, DmMessage, ChatFeedItem, UnreadCounts, UserWithActivity,
} from './types.js';

const TOKEN_KEY = 'eventqa.token';
const ALIAS_KEY = 'eventqa.alias';

function readToken(): string | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setSession(token: string, alias: string): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(ALIAS_KEY, alias);
}

export function clearSession(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(ALIAS_KEY);
}

export function getStoredAlias(): string | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem(ALIAS_KEY);
}

export class ApiCallError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiError,
  ) {
    super(`api ${status}: ${body.error}`);
  }
}

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

async function call<T>(method: Method, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const token = readToken();
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const json = text ? (JSON.parse(text) as unknown) : null;
  if (!res.ok) {
    throw new ApiCallError(res.status, (json as ApiError) ?? { error: 'unknown' });
  }
  return json as T;
}

export const api = {
  login: (input: LoginInput) =>
    call<{ token: string; user: PublicUser }>('POST', '/api/auth/login', input),
  logout: () => call<{ ok: true }>('POST', '/api/auth/logout'),
  me: () => call<{ user: PublicUser }>('GET', '/api/me'),
  patchMe: (data: Partial<{ alias: string; name: string | null; affiliation: string | null; bio: string | null; password: string | null }>) =>
    call<{ user: PublicUser }>('PATCH', '/api/me', data),
  event: () => call<EventMeta>('GET', '/api/event'),
  schedule: () => call<Schedule>('GET', '/api/schedule'),

  talkQuestions: (talkId: string) =>
    call<{ questions: Question[] }>('GET', `/api/talks/${talkId}/questions`),
  createQuestion: (talkId: string, title: string) =>
    call<{ question: Question }>('POST', `/api/talks/${talkId}/questions`, { title }),

  getQuestion: (id: number) =>
    call<{ question: Question; messages: QuestionMessage[] }>('GET', `/api/questions/${id}`),
  updateQuestion: (id: number, title: string) =>
    call<{ question: Question }>('PATCH', `/api/questions/${id}`, { title }),
  createMessage: (questionId: number, body: string) =>
    call<{ message: QuestionMessage }>('POST', `/api/questions/${questionId}/messages`, { body }),
  upvote: (questionId: number) =>
    call<{ upvoted: boolean; vote_count: number }>('POST', `/api/questions/${questionId}/upvote`),
  readQuestion: (questionId: number) =>
    call<{ ok: true }>('POST', `/api/questions/${questionId}/read`),

  getUsers: () => call<{ users: UserWithActivity[] }>('GET', '/api/users'),
  getUser: (alias: string) =>
    call<{ user: UserWithActivity; questions: Question[] }>('GET', `/api/users/${alias}`),

  getDm: (alias: string) =>
    call<{ messages: DmMessage[]; peer: { id: number; alias: string } }>('GET', `/api/dm/${alias}`),
  sendDm: (alias: string, body: string) =>
    call<{ message: DmMessage }>('POST', `/api/dm/${alias}`, { body }),
  readDm: (alias: string) => call<{ ok: true }>('POST', `/api/dm/${alias}/read`),

  getGeneralChat: () => call<{ messages: ChatFeedItem[] }>('GET', '/api/rooms/general'),
  sendGeneralChat: (body: string) => call<{ message: ChatFeedItem }>('POST', '/api/rooms/general', { body }),
  getTalkChat: (talkId: string) => call<{ messages: ChatFeedItem[] }>('GET', `/api/rooms/talks/${talkId}`),
  sendTalkChat: (talkId: string, body: string) =>
    call<{ message: ChatFeedItem }>('POST', `/api/rooms/talks/${talkId}`, { body }),

  unread: () => call<UnreadCounts>('GET', '/api/unread'),

  adminHideQuestion: (id: number) => call<{ ok: true }>('DELETE', `/api/admin/questions/${id}`),
  adminUnhideQuestion: (id: number) => call<{ ok: true }>('POST', `/api/admin/questions/${id}/unhide`),
  adminHideMessage: (id: number) => call<{ ok: true }>('DELETE', `/api/admin/messages/${id}`),
  adminToggleAnswered: (id: number) => call<{ answered: boolean }>('POST', `/api/admin/questions/${id}/answered`),
  adminBanUser: (alias: string) => call<{ banned: boolean }>('POST', `/api/admin/users/${alias}/ban`),
  adminSetUserAdmin: (alias: string) => call<{ is_admin: boolean }>('POST', `/api/admin/users/${alias}/admin`),
  adminSetUserPassword: (alias: string, password: string) =>
    call<{ ok: true }>('POST', `/api/admin/users/${alias}/password`, { password }),
  adminToggleAllowNonAdminQuestions: () =>
    call<{ allow_non_admin_questions: boolean }>('POST', '/api/admin/settings/allow-non-admin-questions'),
};
