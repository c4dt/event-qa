<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import { auth } from '$lib/stores/auth.js';
  import { api } from '$lib/api.js';
  import { addWsHandler, subscribeChannel, unsubscribeChannel } from '$lib/ws.js';
  import { chatFeedKey, chatFeedBadge, chatGroupKey, groupChatFeed } from '$lib/chatFeed.js';
  import type { ChatFeedItem } from '$lib/types.js';

  const ROOM = 'general';

  let messages: ChatFeedItem[] = [];
  $: groups = groupChatFeed(messages, { groupTalks: true });
  let newBody = '';
  let posting = false;
  let error: string | null = null;
  let listEl: HTMLUListElement;
  let inputEl: HTMLInputElement;

  // Every message links back to its most specific origin: a Q&A reply always
  // points at its own thread, even though it also shows up here and in the
  // talk's chat; a talk-chat message points at that talk's chat section.
  function linkFor(item: ChatFeedItem): { href: string; label: string } | null {
    if (item.source === 'question') {
      return { href: `/questions/${item.question_id}`, label: `${item.talk_title} · ${item.question_title}` };
    }
    if (item.source === 'question_new') {
      return { href: `/questions/${item.question_id}`, label: item.talk_title ?? '' };
    }
    if (item.source === 'talk') {
      return { href: `/talks/${item.talk_id}#chat`, label: item.talk_title ?? '' };
    }
    return null;
  }

  async function load() {
    try {
      const data = await api.getGeneralChat();
      messages = data.messages;
      await tick();
      listEl?.scrollTo({ top: listEl.scrollHeight });
    } catch (err) {
      error = (err as Error).message;
    }
  }

  async function send() {
    if (!newBody.trim()) return;
    posting = true;
    try {
      await api.sendGeneralChat(newBody.trim());
      newBody = '';
    } catch (err) {
      error = (err as Error).message;
    } finally {
      posting = false;
    }
    await tick();
    inputEl?.focus();
  }

  let removeHandler: (() => void) | null = null;

  onMount(async () => {
    await load();
    subscribeChannel(`room:${ROOM}`);
    removeHandler = addWsHandler(async (ev) => {
      if (ev.type === 'room.message' && ev.room === ROOM) {
        if (!messages.find((m) => chatFeedKey(m) === chatFeedKey(ev.message))) {
          const atBottom = listEl ? listEl.scrollTop + listEl.clientHeight >= listEl.scrollHeight - 8 : true;
          messages = [...messages, ev.message];
          await tick();
          if (atBottom) listEl?.scrollTo({ top: listEl.scrollHeight });
        }
      }
    });
  });

  onDestroy(() => {
    unsubscribeChannel(`room:${ROOM}`);
    removeHandler?.();
  });

  function fmtTime(ts: number): string {
    return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }
</script>

<div class="flex h-full flex-col" style="height: calc(100vh - 11rem)">
  <div class="mb-4">
    <h1 class="text-xl font-semibold">General chat</h1>
    <p class="text-sm text-gray-500">
      Every talk's chat shows up here too — click a message to jump to that talk's chat.
    </p>
  </div>

  {#if error}
    <p class="text-red-600 text-sm">{error}</p>
  {/if}

  <ul
    bind:this={listEl}
    class="flex-1 overflow-y-auto space-y-2 mb-4 rounded border border-gray-200 p-3 dark:border-gray-700"
  >
    {#if messages.length === 0}
      <li class="text-sm text-gray-400">No messages yet.</li>
    {/if}
    {#each groups as group (chatGroupKey(group))}
      {#if group.kind === 'message'}
        {@const msg = group.item}
        {@const isMe = $auth.status === 'authed' && msg.author_alias === $auth.user.alias}
        {@const link = linkFor(msg)}
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
        <li class="flex justify-start">
          <a
            href={`/questions/${group.questionId}`}
            class="max-w-md rounded-lg border border-purple-200 bg-purple-50/60 px-3 py-2 text-sm hover:opacity-80 dark:border-purple-800 dark:bg-purple-950/20"
          >
            <div class="mb-1 flex items-center gap-1.5">
              <span class="shrink-0 whitespace-nowrap rounded bg-purple-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-purple-700 dark:bg-purple-900/60 dark:text-purple-300">
                Question
              </span>
              {#if group.talkTitle}<span class="min-w-0 truncate text-xs opacity-70">{group.talkTitle}</span>{/if}
            </div>
            <div class="flex items-baseline gap-1.5">
              <span class="font-medium text-gray-900 dark:text-gray-100">{group.questionTitle}</span>
              {#if group.askedAt}<span class="ml-auto shrink-0 text-xs opacity-50">{fmtTime(group.askedAt)}</span>{/if}
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
      {:else}
        <li class="flex justify-start">
          <a
            href={`/talks/${group.talkId}#chat`}
            class="max-w-md rounded-lg border border-green-200 bg-green-50/60 px-3 py-2 text-sm hover:opacity-80 dark:border-green-800 dark:bg-green-950/20"
          >
            <div class="mb-1 flex items-center gap-1.5">
              <span class="shrink-0 whitespace-nowrap rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-green-700 dark:bg-green-900/60 dark:text-green-300">
                Talk chat
              </span>
              <span class="min-w-0 truncate text-xs opacity-70">{group.talkTitle}</span>
            </div>
            <ul class="space-y-1">
              {#each group.items as m (m.id)}
                <li class="flex items-baseline gap-2 text-xs text-gray-700 dark:text-gray-300">
                  <span class="min-w-0"><span class="opacity-70">{m.author_alias}:</span> {m.body}</span>
                  <span class="ml-auto shrink-0 opacity-50">{fmtTime(m.created_at)}</span>
                </li>
              {/each}
            </ul>
          </a>
        </li>
      {/if}
    {/each}
  </ul>

  {#if $auth.status === 'authed'}
    <form class="flex gap-2" on:submit|preventDefault={send}>
      <input
        bind:this={inputEl}
        bind:value={newBody}
        placeholder="Message everyone…"
        class="flex-1 rounded border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800"
        disabled={posting}
      />
      <button
        type="submit"
        class="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
        disabled={posting || !newBody.trim()}
      >
        Send
      </button>
    </form>
  {/if}
</div>
