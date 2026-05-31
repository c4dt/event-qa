<script lang="ts">
  import { onMount } from 'svelte';
  import { auth } from '$lib/stores/auth.js';
  import { unread } from '$lib/stores/unread.js';
  import { api } from '$lib/api.js';
  import type { UserWithActivity } from '$lib/types.js';

  let users: UserWithActivity[] = [];
  let error: string | null = null;

  const PRESENCE_WINDOW = 60_000;

  function isOnline(u: UserWithActivity): boolean {
    return u.last_seen != null && Date.now() - u.last_seen < PRESENCE_WINDOW;
  }

  onMount(async () => {
    try {
      ({ users } = await api.getUsers());
    } catch (err) {
      error = (err as Error).message;
    }
  });
</script>

<nav class="mb-4 text-sm text-gray-500">
  <a href="/" class="hover:underline">Schedule</a>
  <span class="mx-1">›</span>
  <span>Attendees</span>
</nav>

<h1 class="mb-4 text-2xl font-semibold">Attendees</h1>

{#if error}
  <p class="text-red-600">{error}</p>
{:else}
  <ul class="space-y-2">
    {#each users as u (u.id)}
      {@const dmCount = $unread.dms[u.alias] ?? 0}
      <li class="relative flex items-center justify-between rounded border border-gray-200 p-3 dark:border-gray-700">
        <a href={`/users/${u.alias}`} class="absolute inset-0 z-0" aria-label={u.alias}></a>
        <div class="relative z-10 flex items-center gap-3">
          <span
            class="h-2 w-2 rounded-full {isOnline(u) ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}"
            title={isOnline(u) ? 'online' : 'offline'}
          ></span>
          <span class="font-medium">
            {u.alias}
            {#if u.is_admin}
              <span class="ml-1 text-xs text-purple-500">(admin)</span>
            {/if}
          </span>
          {#if u.name}
            <span class="text-sm text-gray-500">{u.name}</span>
          {/if}
          {#if u.affiliation}
            <span class="text-sm text-gray-500">Affiliation: {u.affiliation}</span>
          {/if}
          {#if u.bio}
            <span class="text-sm text-gray-400">Bio: {u.bio}</span>
          {/if}
        </div>
        <div class="relative z-10 flex items-center gap-3 text-sm">
          {#if u.question_count && u.question_count > 0}
            <span class="text-gray-400">{u.question_count} Q</span>
          {/if}
          {#if $auth.status === 'authed' && u.alias !== $auth.user.alias}
            <a href={`/dm/${u.alias}`} class="text-blue-600 hover:underline dark:text-blue-400">
              DM
              {#if dmCount > 0}
                <span class="ml-0.5 rounded-full bg-red-500 px-1 py-0.5 text-xs text-white">{dmCount}</span>
              {/if}
            </a>
          {/if}
          {#if $auth.status === 'authed' && $auth.user.is_admin}
            <button
              type="button"
              class="text-xs text-red-500 hover:underline"
              on:click|stopPropagation={async () => {
                await api.adminBanUser(u.alias);
                users = users.filter((v) => v.alias !== u.alias);
              }}
            >ban</button>
          {/if}
        </div>
      </li>
    {/each}
  </ul>
{/if}
