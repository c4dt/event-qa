<script lang="ts">
  import { page } from '$app/stores';
  $: alias = $page.params.alias;
</script>

<h1 class="text-xl font-semibold">DM with {alias}</h1>
<p class="mt-2 text-sm text-gray-500">DM thread is a stub in this scaffold.</p>
