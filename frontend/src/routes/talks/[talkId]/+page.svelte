<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { auth } from '$lib/stores/auth.js';
  import { unread } from '$lib/stores/unread.js';
  import { api } from '$lib/api.js';
  import { addWsHandler, subscribeChannel, unsubscribeChannel } from '$lib/ws.js';
  import { chatFeedKey, chatFeedBadge, chatGroupKey, groupChatFeed } from '$lib/chatFeed.js';
  import type { EventMeta, Question, Schedule, Talk, Speaker, ChatFeedItem } from '$lib/types.js';
  import Markdown from '$lib/components/Markdown.svelte';

  $: talkId = $page.params.talkId ?? '';
  $: loginHref = `/login?redirect=${encodeURIComponent($page.url.pathname)}`;

  let schedule: Schedule | null = null;
  let event: EventMeta | null = null;
  let questions: Question[] = [];
  let newTitle = '';
  let posting = false;
  let error: string | null = null;

  let chatMessages: ChatFeedItem[] = [];
  $: chatGroups = groupChatFeed(chatMessages, { groupTalks: false });
  let newChatBody = '';
  let postingChat = false;
  let chatListEl: HTMLUListElement;
  let chatInputEl: HTMLInputElement;
  let questionInputEl: HTMLInputElement;

  $: talk = schedule?.tracks.flatMap((tr) => tr.talks).find((t) => t.id === talkId) ?? null;
  $: qaEnabled = talk ? (talk.type !== 'slot' && (talk.qa ?? true)) : false;
  $: talkSpeakers = (schedule && talk)
    ? talk.speakers.map((id) => schedule!.speakers.find((s) => s.id === id)).filter(Boolean) as Speaker[]
    : [];

  async function load() {
    try {
      const [sched, ev, { questions: qs }] = await Promise.all([
        api.schedule(),
        api.event(),
        api.talkQuestions(talkId),
      ]);
      schedule = sched;
      event = ev;
      questions = qs;
    } catch (err) {
      error = (err as Error).message;
    }
  }

  // The root layout resolves auth asynchronously, so `$auth.status` is still
  // 'unknown' when this page's onMount runs — load chat once it settles.
  let chatLoadedFor: string | null = null;
  $: if ($auth.status === 'authed' && talkId && chatLoadedFor !== talkId) {
    chatLoadedFor = talkId;
    void loadChat();
  }

  async function loadChat() {
    try {
      chatMessages = (await api.getTalkChat(talkId)).messages;
      await tick();
      chatListEl?.scrollTo({ top: chatListEl.scrollHeight });
    } catch (err) {
      error = (err as Error).message;
    }
  }

  // Chat is for informal conversation; a question-shaped message typed there
  // probably belongs in the Questions list instead, where it can be answered/upvoted.
  $: chatLooksLikeQuestion =
    qaEnabled && canAsk && newChatBody.trim().length > 3 && newChatBody.trim().endsWith('?');

  async function moveChatDraftToQuestions() {
    newTitle = newChatBody.trim();
    newChatBody = '';
    await tick();
    document.getElementById('questions')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    questionInputEl?.focus();
  }

  async function postChatMessage() {
    if (!newChatBody.trim()) return;
    postingChat = true;
    try {
      const { message } = await api.sendTalkChat(talkId, newChatBody.trim());
      if (!chatMessages.find((m) => chatFeedKey(m) === chatFeedKey(message))) {
        chatMessages = [...chatMessages, message];
      }
      newChatBody = '';
    } catch (err) {
      error = (err as Error).message;
    } finally {
      postingChat = false;
    }
    await tick();
    chatListEl?.scrollTo({ top: chatListEl.scrollHeight });
    chatInputEl?.focus();
  }

  function fmtTime(ts: number): string {
    return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }

  // Q&A replies bubbled up into this talk's chat still link to their own thread.
  function chatLinkFor(item: ChatFeedItem): { href: string; label: string } | null {
    return item.source === 'question'
      ? { href: `/questions/${item.question_id}`, label: item.question_title ?? '' }
      : null;
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
    if ($auth.status !== 'authed') {
      void goto(loginHref);
      return;
    }
    const { upvoted, vote_count } = await api.upvote(q.id);
    questions = questions.map((qv) =>
      qv.id === q.id ? { ...qv, vote_count, user_voted: upvoted ? 1 : 0 } : qv
    );
  }

  let removeHandler: (() => void) | null = null;

  $: isAdmin = $auth.status === 'authed' && $auth.user.is_admin;
  $: canAsk = isAdmin || (event?.allow_non_admin_questions ?? true);

  onMount(async () => {
    await load();
    subscribeChannel(`talk:${talkId}`);
    removeHandler = addWsHandler(async (ev) => {
      if (ev.type === 'question.new' && ev.talkId === talkId) {
        if (!questions.find((q) => q.id === ev.question.id)) {
          questions = [ev.question, ...questions];
        }
      } else if (ev.type === 'question.update') {
        const existing = questions.find((q) => q.id === ev.question.id);
        if (existing) {
          if (ev.question.hidden && !isAdmin) {
            questions = questions.filter((q) => q.id !== ev.question.id);
          } else {
            questions = questions.map((q) => (q.id === ev.question.id ? ev.question : q));
          }
        } else if (isAdmin && ev.question.talk_id === talkId) {
          questions = [ev.question, ...questions];
        }
      } else if (ev.type === 'chat.message' && ev.talkId === talkId) {
        if (!chatMessages.find((m) => chatFeedKey(m) === chatFeedKey(ev.message))) {
          const atBottom = chatListEl
            ? chatListEl.scrollTop + chatListEl.clientHeight >= chatListEl.scrollHeight - 8
            : true;
          chatMessages = [...chatMessages, ev.message];
          await tick();
          if (atBottom) chatListEl?.scrollTo({ top: chatListEl.scrollHeight });
        }
      }
    });
  });

  onDestroy(() => {
    unsubscribeChannel(`talk:${talkId}`);
    removeHandler?.();
  });

  function sortedQuestions(qs: Question[]) {
    return [...qs].sort((a, b) => {
      if (a.answered !== b.answered) return a.answered - b.answered;
      return b.vote_count - a.vote_count || a.created_at - b.created_at;
    });
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
      <div class="mt-2 text-gray-700 dark:text-gray-300">
        <Markdown source={talk.description} />
      </div>
    {/if}
  </div>

  {#if qaEnabled}
  <section id="questions" class="rounded-lg border border-indigo-200 bg-indigo-50/40 p-4 dark:border-indigo-800 dark:bg-indigo-950/20">
    <h2 class="mb-3 flex items-center gap-2 text-lg font-medium">
      <span aria-hidden="true">❓</span> Questions
    </h2>

    {#if $auth.status === 'authed' && canAsk}
      <form class="mb-4 flex gap-2" on:submit|preventDefault={postQuestion}>
        <input
          bind:this={questionInputEl}
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
    {:else if $auth.status === 'authed'}
      <p class="mb-4 text-sm text-gray-500">Only admins can ask questions right now.</p>
    {:else if $auth.status === 'anonymous'}
      <div class="mb-4 flex items-center gap-3 rounded border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-950/40">
        <a
          href={loginHref}
          class="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Log in
        </a>
        <span class="text-sm text-gray-600 dark:text-gray-300">to ask a question or upvote.</span>
      </div>
    {/if}

    {#if sortedQuestions(questions).length === 0}
      <p class="text-sm text-gray-500">No questions yet.</p>
    {:else}
      <ul class="space-y-2">
        {#each sortedQuestions(questions) as q (q.id)}
          <li class="relative flex items-start gap-3 rounded border border-gray-200 p-3 dark:border-gray-700
            {q.answered ? 'border-green-300 dark:border-green-700' : ''}
            {q.hidden ? 'border-dashed border-gray-400 bg-gray-50 opacity-60 dark:border-gray-500 dark:bg-gray-800/40' : ''}">
            <button
              type="button"
              class="relative z-10 flex min-h-[3rem] min-w-[3rem] flex-col items-center justify-center rounded border px-3 py-2 text-sm font-semibold transition-colors
                {q.user_voted
                  ? 'border-blue-500 bg-blue-50 text-blue-600 dark:border-blue-400 dark:bg-blue-900/30 dark:text-blue-400'
                  : 'border-gray-200 bg-white text-gray-400 hover:border-blue-400 hover:text-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:hover:border-blue-500 dark:hover:text-blue-400'}"
              on:click|stopPropagation={() => toggleUpvote(q)}
              title={q.user_voted ? 'Remove upvote' : 'Upvote'}
            >
              <span class="text-base leading-none">▲</span>
              <span class="text-xs tabular-nums">{q.vote_count}</span>
            </button>
            <a href={`/questions/${q.id}`} class="absolute inset-0 z-0" aria-label={q.title}></a>
            <div class="relative z-10 flex-1 pointer-events-none">
              <span class="font-medium">{q.title}</span>
              {#if q.answered}
                <span class="ml-2 rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-700 dark:bg-green-900 dark:text-green-300">answered</span>
              {/if}
              {#if q.hidden}
                <span class="ml-2 rounded bg-gray-200 px-1.5 py-0.5 text-xs text-gray-700 dark:bg-gray-700 dark:text-gray-200">hidden</span>
              {/if}
              <div class="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
                <span>by <a href={$auth.status === 'authed' && q.author_alias === $auth.user.alias ? '/profile' : `/users/${q.author_alias}`} class="hover:underline pointer-events-auto">{q.author_alias}</a></span>
                {#if q.message_count > 0}
                  <span title="replies">💬 {q.message_count}</span>
                {/if}
                <span class="ml-auto">{fmtTime(q.created_at)}</span>
              </div>
            </div>

            {#if isAdmin}
              {#if q.hidden}
                <button
                  type="button"
                  class="relative z-10 text-xs text-blue-500 hover:underline"
                  on:click|stopPropagation={async () => {
                    await api.adminUnhideQuestion(q.id);
                    questions = questions.map((v) => v.id === q.id ? { ...v, hidden: 0 } : v);
                  }}
                >unhide</button>
              {:else}
                <button
                  type="button"
                  class="relative z-10 text-xs text-red-500 hover:underline"
                  on:click|stopPropagation={async () => {
                    await api.adminHideQuestion(q.id);
                    questions = questions.map((v) => v.id === q.id ? { ...v, hidden: 1 } : v);
                  }}
                >hide</button>
              {/if}
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
  </section>
  {:else}
    <p class="text-sm text-gray-500">Q&A is not enabled for this session.</p>
  {/if}

  <div id="chat" class="mt-6 rounded-lg border border-emerald-200 bg-emerald-50/40 p-4 dark:border-emerald-800 dark:bg-emerald-950/20">
    <h2 class="mb-3 flex items-center gap-2 text-lg font-medium">
      <span aria-hidden="true">💬</span> Chat
    </h2>

    {#if $auth.status === 'authed'}
      <ul
        bind:this={chatListEl}
        class="mb-3 max-h-96 space-y-2 overflow-y-auto rounded border border-gray-200 p-3 dark:border-gray-700"
      >
        {#if chatMessages.length === 0}
          <li class="text-sm text-gray-400">No messages yet.</li>
        {/if}
        {#each chatGroups as group (chatGroupKey(group))}
          {#if group.kind === 'message'}
            {@const msg = group.item}
            {@const isMe = msg.author_alias === $auth.user.alias}
            {@const link = chatLinkFor(msg)}
            {@const badge = chatFeedBadge(msg, isMe)}
            <li class="flex {isMe ? 'justify-end' : 'justify-start'}">
              <svelte:element
                this={link ? 'a' : 'div'}
                href={link?.href}
                class="max-w-md rounded-lg px-3 py-2 text-sm
                  {link ? 'border hover:opacity-80' : ''}
                  {isMe
                    ? `bg-blue-600 text-white ${link ? 'border-blue-700' : ''}`
                    : `bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100 ${link ? 'border-gray-200 dark:border-gray-700' : ''}`}"
              >
                <div class="mb-1 flex items-center gap-1.5">
                  <span class="shrink-0 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase {badge.classes}">
                    {badge.label}
                  </span>
                  {#if link}
                    <span class="min-w-0 truncate text-xs opacity-70">{link.label}</span>
                  {/if}
                </div>
                <div>{msg.body}</div>
                <div class="mt-0.5 flex items-center gap-1 text-xs opacity-60">
                  <span>{msg.author_alias}</span>
                  <span class="ml-auto">{fmtTime(msg.created_at)}</span>
                </div>
              </svelte:element>
            </li>
          {:else if group.kind === 'question'}
            {@const askedAt = group.askedAt ?? questions.find((q) => q.id === group.questionId)?.created_at}
            <li class="flex justify-start">
              <a
                href={`/questions/${group.questionId}`}
                class="max-w-md rounded-lg border border-purple-200 bg-purple-50/60 px-3 py-2 text-sm hover:opacity-80 dark:border-purple-800 dark:bg-purple-950/20"
              >
                <div class="mb-1 flex items-center gap-1.5">
                  <span class="shrink-0 whitespace-nowrap rounded bg-purple-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-purple-700 dark:bg-purple-900/60 dark:text-purple-300">
                    Question
                  </span>
                </div>
                <div class="flex items-baseline gap-1.5">
                  <span class="font-medium text-gray-900 dark:text-gray-100">{group.questionTitle}</span>
                  {#if askedAt}<span class="ml-auto shrink-0 text-xs opacity-50">{fmtTime(askedAt)}</span>{/if}
                </div>
                <ul class="mt-1.5 space-y-1 border-t border-purple-200/60 pt-1.5 dark:border-purple-800/60">
                  {#each group.items.filter((i) => i.source === 'question') as reply (reply.id)}
                    <li class="flex items-baseline gap-2 text-xs text-gray-700 dark:text-gray-300">
                      <span class="min-w-0"><span class="opacity-70">{reply.author_alias}:</span> {reply.body}</span>
                      <span class="ml-auto shrink-0 opacity-50">{fmtTime(reply.created_at)}</span>
                    </li>
                  {/each}
                </ul>
              </a>
            </li>
          {/if}
        {/each}
      </ul>
      {#if chatLooksLikeQuestion}
        <div class="mb-2 flex items-center justify-between gap-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
          <span>Looks like a question for the speaker — post it in <strong>Questions</strong> so it can be answered and upvoted?</span>
          <button
            type="button"
            class="shrink-0 rounded bg-amber-600 px-2 py-1 font-medium text-white hover:bg-amber-700"
            on:click={moveChatDraftToQuestions}
          >
            Move to Questions
          </button>
        </div>
      {/if}
      <form class="flex gap-2" on:submit|preventDefault={postChatMessage}>
        <input
          bind:this={chatInputEl}
          bind:value={newChatBody}
          placeholder="Message everyone at this talk…"
          class="flex-1 rounded border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800"
          disabled={postingChat}
        />
        <button
          type="submit"
          class="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
          disabled={postingChat || !newChatBody.trim()}
        >
          Send
        </button>
      </form>
    {:else}
      <div class="flex items-center gap-3 rounded border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-950/40">
        <a
          href={loginHref}
          class="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Log in
        </a>
        <span class="text-sm text-gray-600 dark:text-gray-300">to join this talk's chat.</span>
      </div>
    {/if}
  </div>
{/if}
