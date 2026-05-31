<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { auth } from '$lib/stores/auth.js';
  import { api } from '$lib/api.js';
  import type { UserWithActivity, Question } from '$lib/types.js';

  $: alias = $page.params.alias;

  let user: UserWithActivity | null = null;
  let questions: Question[] = [];
  let error: string | null = null;

  const PRESENCE_WINDOW = 60_000;
  $: online = user?.last_seen != null && Date.now() - user.last_seen < PRESENCE_WINDOW;

  onMount(async () => {
    try {
      const data = await api.getUser(alias);
      user = data.user;
      questions = data.questions;
    } catch (err) {
      error = (err as Error).message;
    }
  });
</script>

{#if error}
  <p class="text-red-600">{error}</p>
{:else if !user}
  <p>Loading…</p>
{:else}
  <nav class="mb-4 text-sm text-gray-500">
    <a href="/users" class="hover:underline">Attendees</a>
    <span class="mx-1">›</span>
    <span>{user.alias}</span>
  </nav>

  <div class="mb-6">
    <div class="flex items-center gap-3">
      <span
        class="h-3 w-3 rounded-full {online ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}"
        title={online ? 'online' : 'offline'}
      ></span>
      <h1 class="text-2xl font-semibold">
        {user.alias}
        {#if user.is_admin}
          <span class="ml-1 text-sm text-purple-500">(admin)</span>
        {/if}
      </h1>
    </div>
    {#if user.name}
      <p class="mt-1 text-lg text-gray-700 dark:text-gray-300">{user.name}</p>
    {/if}
    {#if user.affiliation}
      <p class="text-sm text-gray-500">{user.affiliation}</p>
    {/if}
    {#if user.bio}
      <p class="mt-2 text-gray-700 dark:text-gray-300">{user.bio}</p>
    {/if}

    {#if $auth.status === 'authed' && user.alias !== $auth.user.alias}
      <a href={`/dm/${user.alias}`} class="mt-3 inline-block rounded bg-blue-600 px-4 py-1.5 text-sm text-white hover:bg-blue-700">
        Send DM
      </a>
    {/if}
  </div>

  {#if questions.length > 0}
    <h2 class="mb-2 text-base font-medium">Questions</h2>
    <ul class="space-y-2">
      {#each questions as q (q.id)}
        <li class="rounded border border-gray-200 p-3 dark:border-gray-700">
          <a href={`/questions/${q.id}`} class="font-medium hover:underline">{q.title}</a>
          <div class="text-xs text-gray-400 mt-0.5">▲ {q.vote_count} · {q.talk_id}</div>
        </li>
      {/each}
    </ul>
  {/if}
{/if}
