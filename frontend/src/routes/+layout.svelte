<script lang="ts">
  import '../app.css';
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { auth } from '$lib/stores/auth.js';
  import { unread } from '$lib/stores/unread.js';
  import { api } from '$lib/api.js';
  import { connectWs, disconnectWs, addWsHandler } from '$lib/ws.js';
  import Header from '$lib/components/Header.svelte';

  let eventName = 'Event Q&A';
  let removeWsHandler: (() => void) | null = null;

  onMount(async () => {
    try {
      eventName = (await api.event()).name;
    } catch {
      // ignore
    }
    await auth.refresh();
  });

  onDestroy(() => {
    removeWsHandler?.();
  });

  $: {
    if ($auth.status === 'authed') {
      const token = typeof localStorage !== 'undefined' ? localStorage.getItem('eventqa.token') : null;
      if (token) {
        connectWs(token);
        void unread.refresh();
      }
      if (!removeWsHandler) {
        removeWsHandler = addWsHandler((ev) => {
          if (ev.type === 'dm.new') {
            unread.dmReceived(ev.peerAlias);
          } else if (ev.type === 'question.message') {
            unread.questionMessageReceived(ev.questionId);
          }
        });
      }
    } else if ($auth.status === 'anonymous') {
      disconnectWs();
      unread.reset();
      removeWsHandler?.();
      removeWsHandler = null;
    }
  }

  $: if ($auth.status === 'anonymous' && $page.url.pathname !== '/login') {
    void goto('/login');
  }
</script>

<div class="flex min-h-screen flex-col">
  <Header {eventName} />
  <main class="flex-1 p-4">
    <slot />
  </main>
</div>
