<script lang="ts">
  import { onMount } from 'svelte';
  import { auth } from '$lib/stores/auth.js';
  import { api } from '$lib/api.js';
  import type { Schedule, Talk } from '$lib/types.js';

  let schedule: Schedule | null = null;
  let loadError: string | null = null;

  onMount(async () => {
    try {
      schedule = await api.schedule();
    } catch (err) {
      loadError = (err as Error).message;
    }
  });

  function fmtTime(iso: string): string {
    return new Date(iso).toLocaleString(undefined, {
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function roomName(schedule: Schedule, roomId: string): string {
    return schedule.rooms.find((r) => r.id === roomId)?.name ?? roomId;
  }

  function flatTalks(schedule: Schedule): Array<Talk & { trackName: string }> {
    return schedule.tracks
      .flatMap((tr) => tr.talks.map((t) => ({ ...t, trackName: tr.name })))
      .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  }
</script>

{#if $auth.status !== 'authed'}
  <p>Loading…</p>
{:else if loadError}
  <p class="text-red-600">Could not load schedule: {loadError}</p>
{:else if schedule}
  <h1 class="mb-4 text-2xl font-semibold">Schedule</h1>
  <ul class="space-y-2">
    {#each flatTalks(schedule) as talk (talk.id)}
      <li class="rounded border border-gray-200 p-3 dark:border-gray-700">
        <div class="flex flex-wrap items-baseline justify-between gap-2">
          <a href={`/talks/${talk.id}`} class="text-lg font-medium hover:underline">
            {talk.title}
          </a>
          <span class="text-sm text-gray-500">{fmtTime(talk.start)}</span>
        </div>
        <div class="text-sm text-gray-500">
          {talk.trackName} · {roomName(schedule, talk.room)} · {talk.duration_min} min
        </div>
      </li>
    {/each}
  </ul>
{:else}
  <p>Loading schedule…</p>
{/if}
