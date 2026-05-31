import { writable } from 'svelte/store';
import { api, ApiCallError, clearSession, setSession } from '../api.js';
import type { LoginInput, PublicUser } from '../types.js';

export type AuthState =
  | { status: 'unknown' }
  | { status: 'anonymous' }
  | { status: 'authed'; user: PublicUser };

function createAuthStore() {
  const { subscribe, set } = writable<AuthState>({ status: 'unknown' });

  return {
    subscribe,

    async refresh(): Promise<void> {
      try {
        const { user } = await api.me();
        set({ status: 'authed', user });
      } catch (err) {
        if (err instanceof ApiCallError && err.status === 401) {
          clearSession();
        }
        set({ status: 'anonymous' });
      }
    },

    async login(input: LoginInput): Promise<PublicUser> {
      const { token, user } = await api.login(input);
      setSession(token, user.alias);
      set({ status: 'authed', user });
      return user;
    },

    async logout(): Promise<void> {
      try {
        await api.logout();
      } catch {
        // best-effort
      }
      clearSession();
      set({ status: 'anonymous' });
    },
  };
}

export const auth = createAuthStore();
