import type { ApiError, EventMeta, LoginInput, PublicUser, Schedule } from './types.js';

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
  event: () => call<EventMeta>('GET', '/api/event'),
  schedule: () => call<Schedule>('GET', '/api/schedule'),
};
