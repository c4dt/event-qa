<script lang="ts">
  import { page } from '$app/stores';
  $: questionId = $page.params.questionId;
</script>

<h1 class="text-xl font-semibold">Question {questionId}</h1>
<p class="mt-2 text-sm text-gray-500">Question chatroom is a stub in this scaffold.</p>
