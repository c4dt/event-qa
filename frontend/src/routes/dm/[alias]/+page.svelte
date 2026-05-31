<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import { page } from '$app/stores';
  import { auth } from '$lib/stores/auth.js';
  import { unread } from '$lib/stores/unread.js';
  import { api } from '$lib/api.js';
  import { addWsHandler } from '$lib/ws.js';
  import type { DmMessage } from '$lib/types.js';

  $: alias = $page.params.alias;

  let messages: DmMessage[] = [];
  let newBody = '';
  let posting = false;
  let error: string | null = null;
  let listEl: HTMLUListElement;
  let inputEl: HTMLInputElement;

  async function load() {
    try {
      const data = await api.getDm(alias);
      messages = data.messages;
      await api.readDm(alias);
      unread.clearDm(alias);
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
      await api.sendDm(alias, newBody.trim());
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
    removeHandler = addWsHandler(async (ev) => {
      if (ev.type === 'dm.new' && ev.peerAlias === alias) {
        if (!messages.find((m) => m.id === ev.message.id)) {
          messages = [...messages, ev.message];
          await api.readDm(alias);
          unread.clearDm(alias);
          await tick();
          listEl?.scrollTo({ top: listEl.scrollHeight });
          inputEl?.focus();
        }
      }
    });
  });

  onDestroy(() => {
    removeHandler?.();
  });

  function fmtTime(ts: number): string {
    return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }
</script>

<div class="flex h-full flex-col" style="height: calc(100vh - 11rem)">
  <nav class="mb-2 text-sm text-gray-500">
    <a href="/users" class="hover:underline">Attendees</a>
    <span class="mx-1">›</span>
    <a href={`/users/${alias}`} class="hover:underline">{alias}</a>
    <span class="mx-1">›</span>
    <span>DM</span>
  </nav>

  <div class="mb-4">
    <h1 class="text-xl font-semibold">DM with <a href={`/users/${alias}`} class="hover:underline">{alias}</a></h1>
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
    {#each messages as msg (msg.id)}
      {@const isMe = $auth.status === 'authed' && msg.sender_alias === $auth.user.alias}
      <li class="flex {isMe ? 'justify-end' : 'justify-start'}">
        <div class="max-w-xs rounded-lg px-3 py-2 text-sm
          {isMe ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100'}">
          <div>{msg.body}</div>
          <div class="mt-0.5 text-xs opacity-60">{fmtTime(msg.created_at)}</div>
        </div>
      </li>
    {/each}
  </ul>

  {#if $auth.status === 'authed'}
    <form class="flex gap-2" on:submit|preventDefault={send}>
      <input
        bind:this={inputEl}
        bind:value={newBody}
        placeholder="Message…"
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
