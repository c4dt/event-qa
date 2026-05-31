<script lang="ts">
  import { page } from '$app/stores';
  $: talkId = $page.params.talkId;
</script>

<h1 class="text-xl font-semibold">Talk {talkId}</h1>
<p class="mt-2 text-sm text-gray-500">Talk page is a stub in this scaffold — see TECHNICAL.md.</p>
