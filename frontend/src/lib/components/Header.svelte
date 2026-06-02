<script lang="ts">
  import { auth } from '../stores/auth.js';
  import { unread } from '../stores/unread.js';
  import { theme } from '../stores/theme.js';
  import { goto } from '$app/navigation';

  export let eventName: string = 'Event Q&A';

  $: totalDms = Object.values($unread.dms).reduce((a, b) => a + b, 0);
  $: totalQuestions = Object.values($unread.questions).reduce((a, b) => a + b, 0);
  $: firstUnreadQuestionId = Object.keys($unread.questions).find((id) => ($unread.questions[id] ?? 0) > 0);
</script>

<header
  class="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-800"
>
  <a href="/" class="text-lg font-semibold hover:underline">{eventName}</a>

  <nav class="flex items-center gap-3 text-sm">
    <a href="/users" class="hover:underline">Users</a>
    {#if totalDms > 0}
      <a href="/users" class="hover:underline" title="Unread direct messages">
        <span class="rounded-full bg-red-500 px-1.5 py-0.5 text-xs text-white">{totalDms}</span>
      </a>
    {/if}
    <button
      type="button"
      class="rounded border border-gray-300 px-2 py-1 dark:border-gray-600"
      on:click={() => theme.toggle()}
      aria-label="Toggle dark mode"
    >
      {$theme === 'dark' ? '☀' : '☾'}
    </button>
    {#if $auth.status === 'authed'}
      <a href="/profile" class="hover:underline" title="Edit your profile">{$auth.user.alias}</a>
      {#if totalQuestions > 0 && firstUnreadQuestionId}
        <a href={`/questions/${firstUnreadQuestionId}`} class="hover:underline" title="Unread question replies">
          <span class="rounded-full bg-blue-500 px-1.5 py-0.5 text-xs text-white">
            {totalQuestions}
          </span>
        </a>
      {/if}
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
