<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { page } from '$app/stores';
  import { auth } from '$lib/stores/auth.js';
  import { unread } from '$lib/stores/unread.js';
  import { api } from '$lib/api.js';
  import { addWsHandler, subscribeChannel, unsubscribeChannel } from '$lib/ws.js';
  import type { Question, Schedule, Talk, Speaker } from '$lib/types.js';

  $: talkId = $page.params.talkId;

  let schedule: Schedule | null = null;
  let questions: Question[] = [];
  let newTitle = '';
  let posting = false;
  let error: string | null = null;

  $: talk = schedule?.tracks.flatMap((tr) => tr.talks).find((t) => t.id === talkId) ?? null;
  $: qaEnabled = talk ? (talk.type !== 'slot' && (talk.qa ?? true)) : false;
  $: talkSpeakers = (schedule && talk)
    ? talk.speakers.map((id) => schedule!.speakers.find((s) => s.id === id)).filter(Boolean) as Speaker[]
    : [];

  async function load() {
    try {
      [schedule, { questions }] = await Promise.all([
        api.schedule(),
        api.talkQuestions(talkId),
      ]);
    } catch (err) {
      error = (err as Error).message;
    }
  }

  async function postQuestion() {
    if (!newTitle.trim()) return;
    posting = true;
    try {
      const { question } = await api.createQuestion(talkId, newTitle.trim());
      questions = [question, ...questions];
      newTitle = '';
    } catch (err) {
      error = (err as Error).message;
    } finally {
      posting = false;
    }
  }

  async function toggleUpvote(q: Question) {
    const { upvoted, vote_count } = await api.upvote(q.id);
    questions = questions.map((qv) =>
      qv.id === q.id ? { ...qv, vote_count, user_voted: upvoted ? 1 : 0 } : qv
    );
  }

  let removeHandler: (() => void) | null = null;

  onMount(async () => {
    await load();
    subscribeChannel(`talk:${talkId}`);
    removeHandler = addWsHandler((ev) => {
      if (ev.type === 'question.new' && ev.talkId === talkId) {
        if (!questions.find((q) => q.id === ev.question.id)) {
          questions = [ev.question, ...questions];
        }
      } else if (ev.type === 'question.update') {
        questions = questions.map((q) => (q.id === ev.question.id ? ev.question : q));
      }
    });
  });

  onDestroy(() => {
    unsubscribeChannel(`talk:${talkId}`);
    removeHandler?.();
  });

  function sortedQuestions(qs: Question[]) {
    return [...qs].sort((a, b) => b.vote_count - a.vote_count || a.created_at - b.created_at);
  }
</script>

{#if error}
  <p class="text-red-600">{error}</p>
{:else if !talk}
  <p>Loading…</p>
{:else}
  <nav class="mb-4 text-sm text-gray-500">
    <a href="/" class="hover:underline">Schedule</a>
    <span class="mx-1">›</span>
    <span>{talk.title}</span>
  </nav>

  <div class="mb-6">
    <h1 class="text-2xl font-semibold">{talk.title}</h1>
    {#if talkSpeakers.length > 0}
      <p class="mt-1 text-sm text-gray-500">
        {talkSpeakers.map((s) => s.name).join(', ')}
      </p>
    {/if}
    {#if talk.description}
      <p class="mt-2 text-gray-700 dark:text-gray-300">{talk.description}</p>
    {/if}
  </div>

  {#if qaEnabled}
    <h2 class="mb-3 text-lg font-medium">Questions</h2>

    {#if $auth.status === 'authed'}
      <form class="mb-4 flex gap-2" on:submit|preventDefault={postQuestion}>
        <input
          bind:value={newTitle}
          placeholder="Ask a question…"
          class="flex-1 rounded border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800"
          disabled={posting}
        />
        <button
          type="submit"
          class="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
          disabled={posting || !newTitle.trim()}
        >
          Ask
        </button>
      </form>
    {/if}

    {#if sortedQuestions(questions).length === 0}
      <p class="text-sm text-gray-500">No questions yet.</p>
    {:else}
      <ul class="space-y-2">
        {#each sortedQuestions(questions) as q (q.id)}
          <li class="relative flex items-start gap-3 rounded border border-gray-200 p-3 dark:border-gray-700
            {q.answered ? 'border-green-300 dark:border-green-700' : ''}">
            <button
              type="button"
              class="relative z-10 flex min-h-[3rem] min-w-[3rem] flex-col items-center justify-center rounded px-3 py-2 text-sm
                {q.user_voted ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}"
              on:click|stopPropagation={() => toggleUpvote(q)}
              title={q.user_voted ? 'Remove upvote' : 'Upvote'}
            >
              ▲
              <span>{q.vote_count}</span>
            </button>
            <a href={`/questions/${q.id}`} class="absolute inset-0 z-0" aria-label={q.title}></a>
            <div class="relative z-10 flex-1 pointer-events-none">
              <span class="font-medium">{q.title}</span>
              {#if q.answered}
                <span class="ml-2 rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-700 dark:bg-green-900 dark:text-green-300">answered</span>
              {/if}
              <div class="text-xs text-gray-500 mt-0.5">
                by <a href={`/users/${q.author_alias}`} class="hover:underline pointer-events-auto">{q.author_alias}</a>
              </div>
            </div>

            {#if $auth.status === 'authed' && $auth.user.is_admin}
              <button
                type="button"
                class="relative z-10 text-xs text-red-500 hover:underline"
                on:click|stopPropagation={async () => {
                  await api.adminHideQuestion(q.id);
                  questions = questions.filter((v) => v.id !== q.id);
                }}
              >hide</button>
              <button
                type="button"
                class="relative z-10 text-xs text-gray-500 hover:underline"
                on:click|stopPropagation={async () => {
                  const { answered } = await api.adminToggleAnswered(q.id);
                  questions = questions.map((v) => v.id === q.id ? { ...v, answered: answered ? 1 : 0 } : v);
                }}
              >{q.answered ? 'unmark' : 'answered'}</button>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  {:else}
    <p class="text-sm text-gray-500">Q&A is not enabled for this session.</p>
  {/if}
{/if}
