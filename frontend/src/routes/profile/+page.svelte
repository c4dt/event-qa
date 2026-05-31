<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { auth } from '$lib/stores/auth.js';
  import { theme } from '$lib/stores/theme.js';
  import { api, ApiCallError } from '$lib/api.js';
  import type { PublicUser } from '$lib/types.js';

  let user: PublicUser | null = null;
  let alias = '';
  let name = '';
  let affiliation = '';
  let bio = '';
  let password = '';
  let saving = false;
  let saved = false;
  let error: string | null = null;

  onMount(async () => {
    if ($auth.status === 'authed') {
      user = $auth.user;
      alias = user.alias;
      name = user.name ?? '';
      affiliation = user.affiliation ?? '';
      bio = user.bio ?? '';
    }
  });

  $: if ($auth.status === 'authed' && !user) {
    user = $auth.user;
    alias = user.alias;
    name = user.name ?? '';
    affiliation = user.affiliation ?? '';
    bio = user.bio ?? '';
  }

  async function save() {
    saving = true;
    error = null;
    saved = false;
    try {
      const patch: Record<string, unknown> = {};
      if (alias !== user!.alias) patch.alias = alias;
      if (name !== (user!.name ?? '')) patch.name = name || null;
      if (affiliation !== (user!.affiliation ?? '')) patch.affiliation = affiliation || null;
      if (bio !== (user!.bio ?? '')) patch.bio = bio || null;
      if (password) patch.password = password;

      if (Object.keys(patch).length === 0) {
        saved = true;
        return;
      }

      const { user: updated } = await api.patchMe(patch as Parameters<typeof api.patchMe>[0]);
      // Update localStorage alias if changed
      if (updated.alias !== user!.alias) {
        const token = localStorage.getItem('eventqa.token') ?? '';
        const { setSession } = await import('$lib/api.js');
        setSession(token, updated.alias);
      }
      await auth.refresh();
      user = updated;
      password = '';
      saved = true;
    } catch (err) {
      if (err instanceof ApiCallError) {
        error = err.body.error;
      } else {
        error = (err as Error).message;
      }
    } finally {
      saving = false;
    }
  }

  async function handleLogout() {
    await auth.logout();
    await goto('/login');
  }
</script>

<div class="mx-auto max-w-md">
  <h1 class="mb-6 text-2xl font-semibold">Profile</h1>

  {#if !user}
    <p>Loading…</p>
  {:else}
    <form class="space-y-4" on:submit|preventDefault={save}>
      <div>
        <label for="alias" class="block text-sm font-medium">Alias</label>
        <input
          id="alias"
          bind:value={alias}
          class="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800"
          minlength="1"
          maxlength="64"
        />
      </div>

      <div>
        <label for="name" class="block text-sm font-medium">Display name</label>
        <input
          id="name"
          bind:value={name}
          class="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800"
          maxlength="128"
          placeholder="Optional"
        />
      </div>

      <div>
        <label for="affiliation" class="block text-sm font-medium">Affiliation</label>
        <input
          id="affiliation"
          bind:value={affiliation}
          class="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800"
          maxlength="128"
          placeholder="Optional"
        />
      </div>

      <div>
        <label for="bio" class="block text-sm font-medium">Bio</label>
        <textarea
          id="bio"
          bind:value={bio}
          class="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800"
          rows="3"
          maxlength="2048"
          placeholder="Optional"
        ></textarea>
      </div>

      <div>
        <label for="password" class="block text-sm font-medium">
          New password <span class="text-gray-400 font-normal">(leave blank to keep)</span>
        </label>
        <input
          id="password"
          type="password"
          bind:value={password}
          class="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800"
          autocomplete="new-password"
        />
      </div>

      {#if error}
        <p class="text-sm text-red-600">{error}</p>
      {/if}
      {#if saved}
        <p class="text-sm text-green-600">Saved!</p>
      {/if}

      <div class="flex gap-3">
        <button
          type="submit"
          class="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
          disabled={saving}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>

    <div class="mt-8 border-t border-gray-200 pt-4 dark:border-gray-700">
      <h2 class="mb-3 text-base font-medium">Appearance</h2>
      <div class="flex items-center gap-3">
        <button
          type="button"
          class="rounded border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-600"
          on:click={() => theme.toggle()}
        >
          {$theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
        </button>
        <button
          type="button"
          class="text-sm text-gray-500 hover:underline"
          on:click={() => theme.follow()}
        >
          Follow OS
        </button>
      </div>
    </div>

    <div class="mt-6">
      <button
        type="button"
        class="text-sm text-red-500 hover:underline"
        on:click={handleLogout}
      >
        Log out
      </button>
    </div>
  {/if}
</div>
