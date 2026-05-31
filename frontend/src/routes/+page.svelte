<script lang="ts">
  import { onMount } from 'svelte';
  import { auth } from '$lib/stores/auth.js';
  import { api } from '$lib/api.js';
  import type { Schedule, Talk, Track } from '$lib/types.js';

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
    return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }

  function fmtDate(iso: string): string {
    return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  }

  function speakerNames(schedule: Schedule, ids: string[]): string {
    return ids
      .map((id) => schedule.speakers.find((s) => s.id === id)?.name ?? id)
      .join(', ');
  }

  // For the timeline grid: collect all unique days and rooms
  type GridTalk = Talk & { trackName: string };

  function buildDays(schedule: Schedule): Array<{ date: string; tracks: Array<{ track: Track; talks: GridTalk[] }> }> {
    const allTalks: GridTalk[] = schedule.tracks.flatMap((tr) =>
      tr.talks.map((t) => ({ ...t, trackName: tr.name }))
    );

    const dayMap = new Map<string, Map<string, GridTalk[]>>();
    for (const talk of allTalks) {
      const day = new Date(talk.start).toDateString();
      if (!dayMap.has(day)) dayMap.set(day, new Map());
      const trackMap = dayMap.get(day)!;
      if (!trackMap.has(talk.trackName)) trackMap.set(talk.trackName, []);
      trackMap.get(talk.trackName)!.push(talk);
    }

    return Array.from(dayMap.entries()).map(([, trackMap]) => {
      const firstTalk = Array.from(trackMap.values()).flat()[0]!;
      return {
        date: firstTalk.start,
        tracks: Array.from(trackMap.entries()).map(([, talks]) => ({
          track: schedule.tracks.find((tr) => tr.name === talks[0]!.trackName)!,
          talks: talks.sort((a, b) => Date.parse(a.start) - Date.parse(b.start)),
        })),
      };
    });
  }

  function flatTalks(schedule: Schedule): GridTalk[] {
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
  {@const days = buildDays(schedule)}
  <h1 class="mb-4 text-2xl font-semibold">Schedule</h1>

  <!-- Mobile: simple chronological list -->
  <ul class="space-y-2 lg:hidden">
    {#each flatTalks(schedule) as talk (talk.id)}
      {#if talk.type === 'talk' && (talk.qa ?? true)}
        <li class="relative rounded border border-gray-200 p-3 dark:border-gray-700">
          <a href={`/talks/${talk.id}`} class="absolute inset-0 z-0" aria-label={talk.title}></a>
          <div class="relative z-10 pointer-events-none flex flex-wrap items-baseline justify-between gap-2">
            <span class="text-lg font-medium">{talk.title}</span>
            <span class="text-sm text-gray-500">{fmtTime(talk.start)}</span>
          </div>
          <div class="relative z-10 pointer-events-none text-sm text-gray-500">
            {talk.trackName}
            {#if talk.speakers.length > 0}
              · {speakerNames(schedule, talk.speakers)}
            {/if}
            · {talk.duration_min} min
          </div>
        </li>
      {:else}
        <li class="rounded border border-gray-200 p-3 dark:border-gray-700">
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <span class="text-lg font-medium text-gray-500">{talk.title}</span>
            <span class="text-sm text-gray-500">{fmtTime(talk.start)}</span>
          </div>
          <div class="text-sm text-gray-500">
            {talk.trackName}
            {#if talk.speakers.length > 0}
              · {speakerNames(schedule, talk.speakers)}
            {/if}
            · {talk.duration_min} min
          </div>
        </li>
      {/if}
    {/each}
  </ul>

  <!-- Desktop: multi-track timeline grid per day -->
  <div class="hidden lg:block space-y-8">
    {#each days as day}
      <section>
        <h2 class="mb-2 text-lg font-medium text-gray-700 dark:text-gray-300">{fmtDate(day.date)}</h2>
        <div
          class="grid gap-2"
          style="grid-template-columns: 60px {day.tracks.map(() => '1fr').join(' ')}"
        >
          <!-- Track headers -->
          <div></div>
          {#each day.tracks as { track }}
            <div class="text-center text-sm font-semibold text-gray-600 dark:text-gray-400 border-b pb-1">
              {track.name}
            </div>
          {/each}

          <!-- Time slots -->
          {#each day.tracks[0]?.talks ?? [] as slotTalk}
            {@const slotStart = new Date(slotTalk.start)}
            <div class="text-xs text-gray-400 self-start pt-1">{fmtTime(slotTalk.start)}</div>
            {#each day.tracks as { talks }, ti}
              {@const colTalk = talks.find((t) => t.start === slotTalk.start)}
              {#if colTalk}
                {#if colTalk.type === 'talk' && (colTalk.qa ?? true)}
                  <a
                    href={`/talks/${colTalk.id}`}
                    class="relative block rounded border p-2 text-sm bg-white dark:bg-gray-900 border-blue-200 dark:border-blue-800 hover:border-blue-400 dark:hover:border-blue-600"
                    style="min-height: {Math.max(colTalk.duration_min * 1.5, 40)}px"
                  >
                    <span class="font-medium block">{colTalk.title}</span>
                    {#if colTalk.speakers.length > 0}
                      <span class="text-xs text-gray-400 mt-1 block">{speakerNames(schedule, colTalk.speakers)}</span>
                    {/if}
                    <span class="text-xs text-gray-400">{colTalk.duration_min} min</span>
                  </a>
                {:else}
                  <div
                    class="rounded border p-2 text-sm bg-gray-50 text-gray-500 dark:bg-gray-800 dark:text-gray-400 border-gray-200 dark:border-gray-700"
                    style="min-height: {Math.max(colTalk.duration_min * 1.5, 40)}px"
                  >
                    <span class="font-medium">{colTalk.title}</span>
                    {#if colTalk.speakers.length > 0}
                      <div class="text-xs text-gray-400 mt-1">{speakerNames(schedule, colTalk.speakers)}</div>
                    {/if}
                    <div class="text-xs text-gray-400">{colTalk.duration_min} min</div>
                  </div>
                {/if}
              {:else}
                <div></div>
              {/if}
            {/each}
          {/each}
        </div>
      </section>
    {/each}
  </div>
{:else}
  <p>Loading schedule…</p>
{/if}
