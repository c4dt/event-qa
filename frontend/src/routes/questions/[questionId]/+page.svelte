<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import { page } from '$app/stores';
  import { auth } from '$lib/stores/auth.js';
  import { unread } from '$lib/stores/unread.js';
  import { api } from '$lib/api.js';
  import { addWsHandler, subscribeChannel, unsubscribeChannel } from '$lib/ws.js';
  import type { Question, QuestionMessage, Schedule } from '$lib/types.js';

  $: questionId = Number($page.params.questionId);

  let question: Question | null = null;
  let messages: QuestionMessage[] = [];
  let schedule: Schedule | null = null;
  let newBody = '';
  let posting = false;
  let error: string | null = null;
  let replyInput: HTMLInputElement;
  let messageList: HTMLElement;
  let moreAbove = false;
  let moreBelow = false;

  function updateScrollIndicators() {
    if (!messageList) return;
    moreAbove = messageList.scrollTop > 4;
    moreBelow = messageList.scrollTop + messageList.clientHeight < messageList.scrollHeight - 4;
  }

  $: talkTitle = (schedule && question)
    ? (schedule.tracks.flatMap((tr) => tr.talks).find((t) => t.id === question!.talk_id)?.title ?? question.talk_id)
    : null;

  $: myAlias = $auth.status === 'authed' ? $auth.user.alias : null;

  $: if (replyInput) replyInput.focus();

  function userHref(alias: string): string {
    return myAlias === alias ? '/profile' : `/users/${alias}`;
  }

  async function load() {
    try {
      const [data, sched] = await Promise.all([
        api.getQuestion(questionId),
        api.schedule(),
      ]);
      question = data.question;
      messages = data.messages;
      schedule = sched;
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
      await api.createMessage(question.id, newBody.trim());
      newBody = '';
    } catch (err) {
      error = (err as Error).message;
    } finally {
      posting = false;
    }
    await tick();
    scrollToBottom();
    replyInput?.focus();
  }

  function scrollToBottom() {
    if (messageList) {
      requestAnimationFrame(() => {
        messageList.scrollTop = messageList.scrollHeight;
        updateScrollIndicators();
      });
    }
  }

  let removeHandler: (() => void) | null = null;

  onMount(async () => {
    await load();
    await tick();
    scrollToBottom();
    replyInput?.focus();
    subscribeChannel(`question:${questionId}`);
    removeHandler = addWsHandler(async (ev) => {
      if (ev.type === 'question.message' && ev.questionId === questionId) {
        if (!messages.find((m) => m.id === ev.message.id)) {
          const isMine = ev.message.author_alias === myAlias;
          const atBottom = messageList
            ? messageList.scrollTop + messageList.clientHeight >= messageList.scrollHeight - 8
            : true;
          messages = [...messages, ev.message];
          if (question) question = { ...question, message_count: question.message_count + 1 };
          await tick();
          if (isMine || atBottom) scrollToBottom();
          else updateScrollIndicators();
          replyInput?.focus();
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
  <div class="flex h-[calc(100vh-11rem)] flex-col">
    <!-- Sticky top: breadcrumb + question header -->
    <div class="flex-shrink-0">
      <nav class="mb-4 text-sm text-gray-500">
        <a href="/" class="hover:underline">Schedule</a>
        <span class="mx-1">›</span>
        <a href={`/talks/${question.talk_id}`} class="hover:underline">{talkTitle ?? '…'}</a>
        <span class="mx-1">›</span>
        <span>{question.title}</span>
      </nav>

      <div class="mb-4 rounded border border-gray-200 p-4 dark:border-gray-700
        {question.answered ? 'border-green-300 dark:border-green-700' : ''}">
        <h1 class="text-xl font-semibold">{question.title}</h1>
        <div class="mt-1 flex items-center gap-3 text-sm text-gray-500">
          <span>by <a href={userHref(question.author_alias)} class="hover:underline">{question.author_alias}</a></span>
          <span>▲ {question.vote_count}</span>
          {#if question.answered}
            <span class="rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-700 dark:bg-green-900 dark:text-green-300">
              answered
            </span>
          {/if}
        </div>
      </div>

      <h2 class="mb-2 text-base font-medium">Discussion</h2>
    </div>

    <!-- Scrollable messages area -->
    <div class="relative min-h-0 flex-1">
      <div
        bind:this={messageList}
        on:scroll={updateScrollIndicators}
        class="h-full overflow-y-auto"
      >
        {#if messages.length === 0}
          <p class="mb-4 text-sm text-gray-500">No replies yet.</p>
        {:else}
          <ul class="space-y-2 pb-2">
            {#each messages as msg (msg.id)}
              <li class="rounded border border-gray-100 p-3 dark:border-gray-800">
                <div class="text-sm">{msg.body}</div>
                <div class="mt-1 flex items-center gap-2 text-xs text-gray-400">
                  <a href={userHref(msg.author_alias)} class="hover:underline">{msg.author_alias}</a>
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
      </div>
      {#if moreAbove}
        <button
          type="button"
          on:click={() => messageList && (messageList.scrollTop = 0)}
          class="pointer-events-auto absolute left-1/2 top-1 z-10 -translate-x-1/2 rounded-full bg-gray-700/80 px-2 py-0.5 text-xs text-white shadow hover:bg-gray-700"
          title="Scroll to top"
        >↑ more above</button>
        <div class="pointer-events-none absolute inset-x-0 top-0 h-6 bg-gradient-to-b from-white to-transparent dark:from-gray-900"></div>
      {/if}
      {#if moreBelow}
        <div class="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-white to-transparent dark:from-gray-900"></div>
        <button
          type="button"
          on:click={scrollToBottom}
          class="pointer-events-auto absolute left-1/2 bottom-1 z-10 -translate-x-1/2 rounded-full bg-gray-700/80 px-2 py-0.5 text-xs text-white shadow hover:bg-gray-700"
          title="Scroll to bottom"
        >↓ more below</button>
      {/if}
    </div>

    <!-- Sticky bottom: reply form -->
    {#if $auth.status === 'authed'}
      <div class="flex-shrink-0 pt-2">
        <form class="flex gap-2" on:submit|preventDefault={postMessage}>
          <input
            bind:this={replyInput}
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
      </div>
    {/if}
  </div>
{/if}
