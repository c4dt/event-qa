import { writable } from 'svelte/store';

const KEY = 'eventqa.theme';

function initial(): 'light' | 'dark' {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

function createTheme() {
  const { subscribe, set } = writable<'light' | 'dark'>(initial());
  return {
    subscribe,
    toggle(): void {
      const next = document.documentElement.classList.toggle('dark') ? 'dark' : 'light';
      localStorage.setItem(KEY, next);
      set(next);
    },
    follow(): void {
      localStorage.removeItem(KEY);
      const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.classList.toggle('dark', dark);
      set(dark ? 'dark' : 'light');
    },
  };
}

export const theme = createTheme();
