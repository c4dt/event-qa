import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';
import { auth } from '../src/lib/stores/auth.js';

function mockFetchOnce(status: number, body: unknown): void {
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('auth store', () => {
  it('starts as unknown', () => {
    expect(get(auth).status).toBe('unknown');
  });

  it('login stores token and transitions to authed', async () => {
    mockFetchOnce(200, {
      token: 'tok-123',
      user: {
        id: 1,
        alias: 'alice',
        name: null,
        affiliation: null,
        bio: null,
        is_admin: false,
      },
    });
    const user = await auth.login({ alias: 'alice' });
    expect(user.alias).toBe('alice');
    expect(localStorage.getItem('eventqa.token')).toBe('tok-123');
    const state = get(auth);
    expect(state.status).toBe('authed');
    if (state.status === 'authed') expect(state.user.alias).toBe('alice');
  });

  it('refresh treats 401 as anonymous and clears storage', async () => {
    localStorage.setItem('eventqa.token', 'stale');
    localStorage.setItem('eventqa.alias', 'alice');
    mockFetchOnce(401, { error: 'unauthorized' });
    await auth.refresh();
    expect(get(auth).status).toBe('anonymous');
    expect(localStorage.getItem('eventqa.token')).toBeNull();
  });

  it('logout clears storage', async () => {
    localStorage.setItem('eventqa.token', 'tok');
    localStorage.setItem('eventqa.alias', 'a');
    mockFetchOnce(200, { ok: true });
    await auth.logout();
    expect(localStorage.getItem('eventqa.token')).toBeNull();
    expect(get(auth).status).toBe('anonymous');
  });
});
