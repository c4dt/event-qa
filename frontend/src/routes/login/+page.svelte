<script lang="ts">
  import { goto } from '$app/navigation';
  import { auth } from '$lib/stores/auth.js';
  import { ApiCallError, getStoredAlias } from '$lib/api.js';

  let alias = getStoredAlias() ?? '';
  let password = '';
  let name = '';
  let affiliation = '';
  let bio = '';
  let showExtras = false;
  let error: string | null = null;
  let submitting = false;

  async function submit() {
    error = null;
    submitting = true;
    try {
      await auth.login({
        alias: alias.trim(),
        password: password || undefined,
        name: name || undefined,
        affiliation: affiliation || undefined,
        bio: bio || undefined,
      });
      await goto('/');
    } catch (err) {
      if (err instanceof ApiCallError) {
        error = humanise(err.body.error);
      } else {
        error = 'Could not reach the server.';
      }
    } finally {
      submitting = false;
    }
  }

  function humanise(code: string): string {
    switch (code) {
      case 'alias_busy':
        return 'That alias is already in use — try another or set a password to claim it permanently.';
      case 'bad_password':
        return 'Wrong password for that alias.';
      case 'banned':
        return 'This account has been banned.';
      default:
        return `Login failed (${code}).`;
    }
  }
</script>

<div class="mx-auto max-w-md">
  <h1 class="mb-4 text-2xl font-semibold">Join the event</h1>
  <form on:submit|preventDefault={submit} class="space-y-3">
    <label class="block">
      <span class="text-sm">Alias <span class="text-red-500">*</span></span>
      <input
        type="text"
        required
        autocomplete="username"
        bind:value={alias}
        class="mt-1 block w-full rounded border border-gray-300 bg-white px-2 py-1 dark:border-gray-600 dark:bg-gray-800"
      />
    </label>

    <label class="block">
      <span class="text-sm">Password <span class="text-gray-500">(optional)</span></span>
      <input
        type="password"
        autocomplete="current-password"
        bind:value={password}
        class="mt-1 block w-full rounded border border-gray-300 bg-white px-2 py-1 dark:border-gray-600 dark:bg-gray-800"
      />
      <span class="text-xs text-gray-500">
        Required only for admin accounts and password-protected aliases.
      </span>
    </label>

    <button
      type="button"
      class="text-xs underline"
      on:click={() => (showExtras = !showExtras)}
    >
      {showExtras ? 'Hide' : 'Add'} name / affiliation / bio
    </button>

    {#if showExtras}
      <label class="block">
        <span class="text-sm">Name</span>
        <input
          type="text"
          bind:value={name}
          class="mt-1 block w-full rounded border border-gray-300 bg-white px-2 py-1 dark:border-gray-600 dark:bg-gray-800"
        />
      </label>
      <label class="block">
        <span class="text-sm">Affiliation</span>
        <input
          type="text"
          bind:value={affiliation}
          class="mt-1 block w-full rounded border border-gray-300 bg-white px-2 py-1 dark:border-gray-600 dark:bg-gray-800"
        />
      </label>
      <label class="block">
        <span class="text-sm">Bio</span>
        <textarea
          bind:value={bio}
          rows="3"
          class="mt-1 block w-full rounded border border-gray-300 bg-white px-2 py-1 dark:border-gray-600 dark:bg-gray-800"
        ></textarea>
      </label>
    {/if}

    {#if error}
      <p class="text-sm text-red-600">{error}</p>
    {/if}

    <button
      type="submit"
      disabled={submitting || !alias.trim()}
      class="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
    >
      {submitting ? 'Joining…' : 'Join'}
    </button>
  </form>
</div>
