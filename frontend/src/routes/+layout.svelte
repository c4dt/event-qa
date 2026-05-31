<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { auth } from '$lib/stores/auth.js';
  import { api } from '$lib/api.js';
  import Header from '$lib/components/Header.svelte';

  let eventName = 'Event Q&A';

  onMount(async () => {
    try {
      eventName = (await api.event()).name;
    } catch {
      // ignore — server may not be reachable yet
    }
    await auth.refresh();
  });

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
