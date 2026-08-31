<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '$lib/api.js';
  import type { Schedule, Talk, Track } from '$lib/types.js';

  let schedule: Schedule | null = null;
  let loadError: string | null = null;

  // Drives the "currently active" highlight; ticks so it stays correct as talks start/end.
  let now = Date.now();
  let mobileTalkEls: Record<string, HTMLLIElement> = {};
  let scrolledToActive = false;

  onMount(() => {
    const timer = setInterval(() => (now = Date.now()), 30_000);
    return () => clearInterval(timer);
  });

  onMount(async () => {
    try {
      schedule = await api.schedule();
    } catch (err) {
      loadError = (err as Error).message;
    }
  });

  function isActive(talk: Talk, now: number): boolean {
    const start = Date.parse(talk.start);
    return now >= start && now < start + talk.duration_min * 60_000;
  }

  $: activeTalkId = schedule ? flatTalks(schedule).find((t) => isActive(t, now))?.id ?? null : null;

  // Once the active talk's element is rendered, jump the mobile list to it.
  $: if (activeTalkId && mobileTalkEls[activeTalkId] && !scrolledToActive) {
    scrolledToActive = true;
    mobileTalkEls[activeTalkId].scrollIntoView({ block: 'start' });
  }

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

  function roomName(schedule: Schedule, roomId: string): string {
    return schedule.rooms.find((r) => r.id === roomId)?.name ?? roomId;
  }

  // The room a track's talks mostly happen in — shown under the track name.
  function trackRoomName(schedule: Schedule, track: Track): string | null {
    const counts = new Map<string, number>();
    for (const t of track.talks) {
      counts.set(t.room, (counts.get(t.room) ?? 0) + 1);
    }
    let bestRoom: string | null = null;
    let bestCount = 0;
    for (const [room, count] of counts) {
      if (count > bestCount) {
        bestCount = count;
        bestRoom = room;
      }
    }
    if (!bestRoom) return null;
    return schedule.rooms.find((r) => r.id === bestRoom)?.name ?? bestRoom;
  }

  // For the timeline grid: collect all unique days and rooms
  type GridTalk = Talk & {
    trackName: string;
    trackIndex: number;
    spansAllTracks: boolean;
    gridRowStart: number;
    gridRowSpan: number;
  };

  // Minutes per grid row — small enough to render arbitrary talk durations smoothly.
  const ROW_MIN = 5;
  // Pixel height of one grid row.
  const ROW_PX = 20;
  // A session that fills every track (nothing else running) is capped to this
  // many rows — its box only needs to fit its text, not its real-world
  // duration. Breaks stay short and full-width, so their text needs little
  // room; a solo talk (e.g. a keynote) stays in its own narrow track column
  // and carries a title plus speaker name, so it needs more room to avoid
  // clipping.
  const BREAK_ROW_CAP = 3;
  const SOLO_TALK_ROW_CAP = 8;

  type Day = {
    date: string;
    tracks: Track[];
    talks: GridTalk[];
    rowCount: number;
    timeLabels: Array<{ label: string; row: number }>;
  };

  function buildDays(schedule: Schedule): Day[] {
    const allTalks = schedule.tracks.flatMap((tr, trackIndex) =>
      tr.talks.map((t) => ({ ...t, trackName: tr.name, trackIndex }))
    );

    const dayMap = new Map<string, typeof allTalks>();
    for (const talk of allTalks) {
      const day = new Date(talk.start).toDateString();
      if (!dayMap.has(day)) dayMap.set(day, []);
      dayMap.get(day)!.push(talk);
    }

    return Array.from(dayMap.values()).map((rawTalks) => {
      rawTalks.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));

      // Any session — break or talk — only fills every track column when
      // nothing else is running during it. If something overlaps it in
      // another track, keep it confined to its own track column so it
      // doesn't cover up concurrent sessions.
      const spansAllTracks = new Map<string, boolean>();
      for (const t of rawTalks) {
        const tStart = Date.parse(t.start);
        const tEnd = tStart + t.duration_min * 60_000;
        const overlapsOther = rawTalks.some((other) => {
          if (other === t) return false;
          const oStart = Date.parse(other.start);
          const oEnd = oStart + other.duration_min * 60_000;
          return oStart < tEnd && oEnd > tStart;
        });
        spansAllTracks.set(t.id, !overlapsOther);
      }

      // Map real clock time to grid rows, compressing stretches where only a
      // single full-width session (break or keynote) is running — those only
      // need rows enough for their text, not their real duration — while
      // keeping talk time proportional whenever tracks run in parallel.
      const boundaries = Array.from(
        new Set(rawTalks.flatMap((t) => [Date.parse(t.start), Date.parse(t.start) + t.duration_min * 60_000]))
      ).sort((a, b) => a - b);

      const rowAt = new Map<number, number>();
      rowAt.set(boundaries[0], 0);
      let cumRows = 0;
      for (let i = 0; i < boundaries.length - 1; i++) {
        const segStart = boundaries[i];
        const segEnd = boundaries[i + 1];
        const realRows = Math.max(1, Math.round((segEnd - segStart) / (ROW_MIN * 60_000)));
        const active = rawTalks.filter((t) => {
          const tStart = Date.parse(t.start);
          const tEnd = tStart + t.duration_min * 60_000;
          return tStart < segEnd && tEnd > segStart;
        });
        const soloSession = active.every((t) => spansAllTracks.get(t.id) ?? false);
        const cap = active.some((t) => t.type !== 'slot') ? SOLO_TALK_ROW_CAP : BREAK_ROW_CAP;
        cumRows += soloSession ? Math.min(realRows, cap) : realRows;
        rowAt.set(segEnd, cumRows);
      }

      const talks: GridTalk[] = rawTalks.map((t) => {
        const tStart = Date.parse(t.start);
        const tEnd = tStart + t.duration_min * 60_000;
        return {
          ...t,
          spansAllTracks: spansAllTracks.get(t.id) ?? false,
          gridRowStart: rowAt.get(tStart)! + 1,
          gridRowSpan: Math.max(1, rowAt.get(tEnd)! - rowAt.get(tStart)!),
        };
      });

      // Time labels: one per unique talk start time, plus a final label for
      // when the day actually ends.
      const uniqueStarts = Array.from(new Set(talks.map((t) => t.start))).sort(
        (a, b) => Date.parse(a) - Date.parse(b)
      );
      const timeLabels = uniqueStarts.map((s) => ({
        label: fmtTime(s),
        row: rowAt.get(Date.parse(s))! + 1,
      }));
      const endMs = boundaries[boundaries.length - 1];
      timeLabels.push({
        label: fmtTime(new Date(endMs).toISOString()),
        row: rowAt.get(endMs)! + 1,
      });

      return {
        date: new Date(boundaries[0]).toISOString(),
        tracks: schedule.tracks,
        talks,
        rowCount: cumRows + 1,
        timeLabels,
      };
    });
  }

  function talkGridStyle(talk: GridTalk): string {
    if (talk.type === 'slot' && talk.spansAllTracks) {
      // Breaks with nothing running concurrently fill every track column —
      // unlike talks, they aren't tied to a specific room.
      return `grid-column: 2 / -1; grid-row: ${talk.gridRowStart} / span ${talk.gridRowSpan};`;
    }

    // Columns alternate: gutter, track, gutter, track, ... so track i is at column 2*(i+1).
    const col = (talk.trackIndex + 1) * 2;
    return `grid-column: ${col}; grid-row: ${talk.gridRowStart} / span ${talk.gridRowSpan};`;
  }

  function flatTalks(schedule: Schedule): Array<Talk & { trackName: string }> {
    return schedule.tracks
      .flatMap((tr) => tr.talks.map((t) => ({ ...t, trackName: tr.name })))
      .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  }
</script>

{#if loadError}
  <p class="text-red-600">Could not load schedule: {loadError}</p>
{:else if schedule}
  {@const days = buildDays(schedule)}
  <h1 class="mb-4 text-2xl font-semibold">Schedule</h1>

  <!-- Mobile: simple chronological list -->
  <ul class="space-y-2 lg:hidden">
    {#each flatTalks(schedule) as talk (talk.id)}
      {#if talk.type === 'talk' && (talk.qa ?? true)}
        <li
          bind:this={mobileTalkEls[talk.id]}
          class="relative rounded border p-3 {isActive(talk, now)
            ? 'border-blue-500 ring-1 ring-blue-500 bg-blue-50 dark:bg-blue-950/40'
            : 'border-gray-200 dark:border-gray-700'}"
        >
          <a href={`/talks/${talk.id}`} class="absolute inset-0 z-0" aria-label={talk.title}></a>
          <div class="relative z-10 pointer-events-none flex items-baseline justify-between gap-2">
            <span class="text-lg font-medium min-w-0 flex-1">{talk.title}</span>
            <span class="text-sm text-gray-500 shrink-0 whitespace-nowrap">{fmtTime(talk.start)}</span>
          </div>
          <div class="relative z-10 pointer-events-none text-sm text-gray-500">
            {talk.trackName} · {roomName(schedule, talk.room)}
            {#if talk.speakers.length > 0}
              · {speakerNames(schedule, talk.speakers)}
            {/if}
            · {talk.duration_min} min
          </div>
        </li>
      {:else}
        <li
          bind:this={mobileTalkEls[talk.id]}
          class="rounded border p-3 {isActive(talk, now)
            ? 'border-blue-500 ring-1 ring-blue-500 bg-blue-50 dark:bg-blue-950/40'
            : 'border-gray-200 dark:border-gray-700'}"
        >
          <div class="flex items-baseline justify-between gap-2">
            <span class="text-lg font-medium text-gray-500 min-w-0 flex-1">{talk.title}</span>
            <span class="text-sm text-gray-500 shrink-0 whitespace-nowrap">{fmtTime(talk.start)}</span>
          </div>
          <div class="text-sm text-gray-500">
            {talk.trackName} · {roomName(schedule, talk.room)}
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
            {@const roomName = trackRoomName(schedule, track)}
            <div></div>
            <div class="flex h-full flex-col text-center text-sm font-semibold text-gray-600 dark:text-gray-400 border-b pb-1">
              <span>{track.name}</span>
              {#if roomName}
                <div class="mt-auto text-xs font-normal text-gray-400">{roomName}</div>
              {/if}
            </div>
          {/each}
        </div>

        <!-- Timeline grid: rows = ROW_MIN-minute slots, columns = (time gutter + track) repeated per track -->
        <div
          class="grid gap-x-2"
          style="grid-template-columns: {day.tracks.map(() => '60px 1fr').join(' ')}; grid-template-rows: repeat({day.rowCount}, {ROW_PX}px);"
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
                class="block rounded border p-2 text-sm bg-white dark:bg-gray-900 overflow-hidden {isActive(talk, now)
                  ? 'border-blue-500 ring-1 ring-blue-500 bg-blue-50 dark:bg-blue-950/40'
                  : 'border-blue-200 dark:border-blue-800 hover:border-blue-400 dark:hover:border-blue-600'}"
                style={talkGridStyle(talk)}
              >
                <span class="font-medium">{talk.title}</span>
                <span class="text-xs text-gray-400">· {talk.duration_min} min</span>
                {#if talk.speakers.length > 0}
                  <span class="text-xs text-gray-400 mt-1 block">{speakerNames(schedule, talk.speakers)}</span>
                {/if}
              </a>
            {:else}
              <div
                class="flex items-center justify-center gap-2 rounded border p-2 text-sm overflow-hidden {isActive(talk, now)
                  ? 'border-blue-500 ring-1 ring-blue-500 bg-blue-50 dark:bg-blue-950/40 text-gray-700 dark:text-gray-200'
                  : 'bg-gray-50 text-gray-500 dark:bg-gray-800 dark:text-gray-400 border-gray-200 dark:border-gray-700'}"
                style={talkGridStyle(talk)}
              >
                <span class="font-medium">{talk.title}</span>
                <span class="text-xs text-gray-400 whitespace-nowrap">· {talk.duration_min} min</span>
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
