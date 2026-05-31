import { writable } from 'svelte/store';
import { api } from '../api.js';
import type { UnreadCounts } from '../types.js';

const empty: UnreadCounts = { dms: {}, questions: {} };

function createUnreadStore() {
  const { subscribe, set, update } = writable<UnreadCounts>(empty);

  return {
    subscribe,

    async refresh() {
      try {
        const counts = await api.unread();
        set(counts);
      } catch {
        // ignore if not authed yet
      }
    },

    dmReceived(peerAlias: string) {
      update((s) => ({
        ...s,
        dms: { ...s.dms, [peerAlias]: (s.dms[peerAlias] ?? 0) + 1 },
      }));
    },

    questionMessageReceived(questionId: number) {
      const key = String(questionId);
      update((s) => ({
        ...s,
        questions: { ...s.questions, [key]: (s.questions[key] ?? 0) + 1 },
      }));
    },

    clearDm(peerAlias: string) {
      update((s) => {
        const dms = { ...s.dms };
        delete dms[peerAlias];
        return { ...s, dms };
      });
    },

    clearQuestion(questionId: number) {
      const key = String(questionId);
      update((s) => {
        const questions = { ...s.questions };
        delete questions[key];
        return { ...s, questions };
      });
    },

    reset() {
      set(empty);
    },
  };
}

export const unread = createUnreadStore();
