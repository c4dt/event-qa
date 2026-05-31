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
  type GridTalk = Talk & { trackName: string; trackIndex: number };

  // Minutes per grid row — small enough to render arbitrary talk durations smoothly.
  const ROW_MIN = 5;

  type Day = {
    date: string;
    tracks: Track[];
    talks: GridTalk[];
    startMs: number;
    rowCount: number;
    timeLabels: Array<{ label: string; row: number }>;
  };

  function buildDays(schedule: Schedule): Day[] {
    const allTalks: GridTalk[] = schedule.tracks.flatMap((tr, trackIndex) =>
      tr.talks.map((t) => ({ ...t, trackName: tr.name, trackIndex }))
    );

    const dayMap = new Map<string, GridTalk[]>();
    for (const talk of allTalks) {
      const day = new Date(talk.start).toDateString();
      if (!dayMap.has(day)) dayMap.set(day, []);
      dayMap.get(day)!.push(talk);
    }

    return Array.from(dayMap.values()).map((talks) => {
      talks.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
      const startMs = Math.min(...talks.map((t) => Date.parse(t.start)));
      const endMs = Math.max(
        ...talks.map((t) => Date.parse(t.start) + t.duration_min * 60_000)
      );
      const rowCount = Math.ceil((endMs - startMs) / (ROW_MIN * 60_000));

      // Time labels: one per unique talk start time.
      const uniqueStarts = Array.from(new Set(talks.map((t) => t.start))).sort(
        (a, b) => Date.parse(a) - Date.parse(b)
      );
      const timeLabels = uniqueStarts.map((s) => ({
        label: fmtTime(s),
        row: Math.round((Date.parse(s) - startMs) / (ROW_MIN * 60_000)) + 1,
      }));

      return {
        date: new Date(startMs).toISOString(),
        tracks: schedule.tracks,
        talks,
        startMs,
        rowCount,
        timeLabels,
      };
    });
  }

  function talkGridStyle(talk: GridTalk, day: Day): string {
    const rowStart = Math.round((Date.parse(talk.start) - day.startMs) / (ROW_MIN * 60_000)) + 1;
    const rowSpan = Math.max(1, Math.round(talk.duration_min / ROW_MIN));
    // Columns alternate: gutter, track, gutter, track, ... so track i is at column 2*(i+1).
    const col = (talk.trackIndex + 1) * 2;
    return `grid-column: ${col}; grid-row: ${rowStart} / span ${rowSpan};`;
  }

  function flatTalks(schedule: Schedule): GridTalk[] {
    return schedule.tracks
      .flatMap((tr, trackIndex) => tr.talks.map((t) => ({ ...t, trackName: tr.name, trackIndex })))
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
          <div class="relative z-10 pointer-events-none flex items-baseline justify-between gap-2">
            <span class="text-lg font-medium min-w-0 flex-1">{talk.title}</span>
            <span class="text-sm text-gray-500 shrink-0 whitespace-nowrap">{fmtTime(talk.start)}</span>
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
          <div class="flex items-baseline justify-between gap-2">
            <span class="text-lg font-medium text-gray-500 min-w-0 flex-1">{talk.title}</span>
            <span class="text-sm text-gray-500 shrink-0 whitespace-nowrap">{fmtTime(talk.start)}</span>
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

        <!-- Track headers -->
        <div
          class="grid gap-2 mb-2"
          style="grid-template-columns: {day.tracks.map(() => '60px 1fr').join(' ')}"
        >
          {#each day.tracks as track}
            <div></div>
            <div class="text-center text-sm font-semibold text-gray-600 dark:text-gray-400 border-b pb-1">
              {track.name}
            </div>
          {/each}
        </div>

        <!-- Timeline grid: rows = ROW_MIN-minute slots, columns = (time gutter + track) repeated per track -->
        <div
          class="grid gap-x-2"
          style="grid-template-columns: {day.tracks.map(() => '60px 1fr').join(' ')}; grid-template-rows: repeat({day.rowCount}, 6px);"
        >
          <!-- Time labels: one gutter column before each track -->
          {#each day.tracks as _, trackIndex}
            {#each day.timeLabels as { label, row }}
              <div
                class="text-xs text-gray-400 pl-3 pr-0"
                style="grid-column: {trackIndex * 2 + 1}; grid-row: {row} / span 1;"
              >
                {label}
              </div>
            {/each}
          {/each}

          <!-- Talks positioned by start time and duration -->
          {#each day.talks as talk (talk.id)}
            {#if talk.type === 'talk' && (talk.qa ?? true)}
              <a
                href={`/talks/${talk.id}`}
                class="block rounded border p-2 text-sm bg-white dark:bg-gray-900 border-blue-200 dark:border-blue-800 hover:border-blue-400 dark:hover:border-blue-600 overflow-hidden"
                style={talkGridStyle(talk, day)}
              >
                <span class="font-medium">{talk.title}</span>
                <span class="text-xs text-gray-400">· {talk.duration_min} min</span>
                {#if talk.speakers.length > 0}
                  <span class="text-xs text-gray-400 mt-1 block">{speakerNames(schedule, talk.speakers)}</span>
                {/if}
              </a>
            {:else}
              <div
                class="rounded border p-2 text-sm bg-gray-50 text-gray-500 dark:bg-gray-800 dark:text-gray-400 border-gray-200 dark:border-gray-700 overflow-hidden"
                style={talkGridStyle(talk, day)}
              >
                <span class="font-medium">{talk.title}</span>
                <span class="text-xs text-gray-400">· {talk.duration_min} min</span>
                {#if talk.speakers.length > 0}
                  <div class="text-xs text-gray-400 mt-1">{speakerNames(schedule, talk.speakers)}</div>
                {/if}
              </div>
            {/if}
          {/each}
        </div>
      </section>
    {/each}
  </div>
{:else}
  <p>Loading schedule…</p>
{/if}
