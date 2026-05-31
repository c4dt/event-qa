<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { page } from '$app/stores';
  import { auth } from '$lib/stores/auth.js';
  import { unread } from '$lib/stores/unread.js';
  import { api } from '$lib/api.js';
  import { addWsHandler, subscribeChannel, unsubscribeChannel } from '$lib/ws.js';
  import type { Question, QuestionMessage } from '$lib/types.js';

  $: questionId = Number($page.params.questionId);

  let question: Question | null = null;
  let messages: QuestionMessage[] = [];
  let newBody = '';
  let posting = false;
  let error: string | null = null;

  async function load() {
    try {
      const data = await api.getQuestion(questionId);
      question = data.question;
      messages = data.messages;
      await api.readQuestion(questionId);
      unread.clearQuestion(questionId);
    } catch (err) {
      error = (err as Error).message;
    }
  }

  async function postMessage() {
    if (!newBody.trim() || !question) return;
    posting = true;
    try {
      const { message } = await api.createMessage(question.id, newBody.trim());
      messages = [...messages, message];
      newBody = '';
    } catch (err) {
      error = (err as Error).message;
    } finally {
      posting = false;
    }
  }

  let removeHandler: (() => void) | null = null;

  onMount(async () => {
    await load();
    subscribeChannel(`question:${questionId}`);
    removeHandler = addWsHandler((ev) => {
      if (ev.type === 'question.message' && ev.questionId === questionId) {
        if (!messages.find((m) => m.id === ev.message.id)) {
          messages = [...messages, ev.message];
        }
      } else if (ev.type === 'question.update' && ev.question.id === questionId) {
        question = ev.question;
      }
    });
  });

  onDestroy(() => {
    unsubscribeChannel(`question:${questionId}`);
    removeHandler?.();
  });

  function fmtTime(ts: number): string {
    return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }
</script>

{#if error}
  <p class="text-red-600">{error}</p>
{:else if !question}
  <p>Loading…</p>
{:else}
  <nav class="mb-4 text-sm text-gray-500">
    <a href="/" class="hover:underline">Schedule</a>
    <span class="mx-1">›</span>
    <a href={`/talks/${question.talk_id}`} class="hover:underline">Talk</a>
    <span class="mx-1">›</span>
    <span>{question.title}</span>
  </nav>

  <div class="mb-6 rounded border border-gray-200 p-4 dark:border-gray-700
    {question.answered ? 'border-green-300 dark:border-green-700' : ''}">
    <h1 class="text-xl font-semibold">{question.title}</h1>
    <div class="mt-1 flex items-center gap-3 text-sm text-gray-500">
      <span>by <a href={`/users/${question.author_alias}`} class="hover:underline">{question.author_alias}</a></span>
      <span>▲ {question.vote_count}</span>
      {#if question.answered}
        <span class="rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-700 dark:bg-green-900 dark:text-green-300">
          answered
        </span>
      {/if}
    </div>
  </div>

  <h2 class="mb-3 text-base font-medium">Discussion</h2>

  {#if messages.length === 0}
    <p class="mb-4 text-sm text-gray-500">No replies yet.</p>
  {:else}
    <ul class="mb-4 space-y-2">
      {#each messages as msg (msg.id)}
        <li class="rounded border border-gray-100 p-3 dark:border-gray-800">
          <div class="text-sm">{msg.body}</div>
          <div class="mt-1 flex items-center gap-2 text-xs text-gray-400">
            <a href={`/users/${msg.author_alias}`} class="hover:underline">{msg.author_alias}</a>
            <span>·</span>
            <span>{fmtTime(msg.created_at)}</span>
            {#if $auth.status === 'authed' && $auth.user.is_admin}
              <button
                type="button"
                class="ml-2 text-red-500 hover:underline"
                on:click={async () => {
                  await api.adminHideMessage(msg.id);
                  messages = messages.filter((m) => m.id !== msg.id);
                }}
              >hide</button>
            {/if}
          </div>
        </li>
      {/each}
    </ul>
  {/if}

  {#if $auth.status === 'authed'}
    <form class="flex gap-2" on:submit|preventDefault={postMessage}>
      <input
        bind:value={newBody}
        placeholder="Reply…"
        class="flex-1 rounded border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800"
        disabled={posting}
      />
      <button
        type="submit"
        class="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
        disabled={posting || !newBody.trim()}
      >
        Reply
      </button>
    </form>
  {/if}
{/if}
