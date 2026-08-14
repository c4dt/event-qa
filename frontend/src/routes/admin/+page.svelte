<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { auth } from '$lib/stores/auth.js';
  import { api } from '$lib/api.js';

  let allowNonAdminQuestions: boolean | null = null;
  let error: string | null = null;

  async function toggleAllowNonAdminQuestions() {
    error = null;
    try {
      ({ allow_non_admin_questions: allowNonAdminQuestions } = await api.adminToggleAllowNonAdminQuestions());
    } catch (err) {
      error = (err as Error).message;
    }
  }

  $: if ($auth.status === 'authed' && !$auth.user.is_admin) {
    void goto('/');
  }

  onMount(async () => {
    try {
      ({ allow_non_admin_questions: allowNonAdminQuestions } = await api.event());
    } catch (err) {
      error = (err as Error).message;
    }
  });
</script>

<nav class="mb-4 text-sm text-gray-500">
  <a href="/" class="hover:underline">Schedule</a>
  <span class="mx-1">›</span>
  <span>Settings</span>
</nav>

<h1 class="mb-4 text-2xl font-semibold">Settings</h1>

{#if error}
  <p class="text-red-600">{error}</p>
{:else if allowNonAdminQuestions !== null}
  <div class="flex items-center justify-between rounded border border-gray-200 p-3 dark:border-gray-700">
    <span class="text-sm">Allow questions from non-admins</span>
    <button
      type="button"
      role="switch"
      aria-checked={allowNonAdminQuestions}
      aria-label="Allow questions from non-admins"
      on:click={toggleAllowNonAdminQuestions}
      class="relative h-6 w-11 flex-shrink-0 rounded-full transition-colors {allowNonAdminQuestions ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'}"
    >
      <span class="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform {allowNonAdminQuestions ? 'translate-x-5' : ''}"></span>
    </button>
  </div>
{/if}
