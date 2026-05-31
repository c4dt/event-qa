<script lang="ts">
  import { auth } from '../stores/auth.js';
  import { theme } from '../stores/theme.js';
  import { goto } from '$app/navigation';

  export let eventName: string = 'Event Q&A';
</script>

<header
  class="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-800"
>
  <a href="/" class="text-lg font-semibold hover:underline">{eventName}</a>

  <nav class="flex items-center gap-3 text-sm">
    <a href="/users" class="hover:underline">Users</a>
    <button
      type="button"
      class="rounded border border-gray-300 px-2 py-1 dark:border-gray-600"
      on:click={() => theme.toggle()}
      aria-label="Toggle dark mode"
    >
      {$theme === 'dark' ? '☀' : '☾'}
    </button>
    {#if $auth.status === 'authed'}
      <a href="/profile" class="hover:underline">{$auth.user.alias}</a>
      <button
        type="button"
        class="rounded border border-gray-300 px-2 py-1 dark:border-gray-600"
        on:click={async () => {
          await auth.logout();
          await goto('/login');
        }}
      >
        Log out
      </button>
    {/if}
  </nav>
</header>
