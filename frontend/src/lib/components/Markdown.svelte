<script lang="ts">
  import { marked } from 'marked';
  import DOMPurify from 'dompurify';

  export let source: string = '';

  $: html = DOMPurify.sanitize(marked.parse(source, { async: false }) as string);
</script>

<div class="markdown">
  {@html html}
</div>

<style>
  .markdown :global(p) {
    margin: 0.25em 0;
  }
  .markdown :global(p:first-child) {
    margin-top: 0;
  }
  .markdown :global(p:last-child) {
    margin-bottom: 0;
  }
  .markdown :global(h1),
  .markdown :global(h2),
  .markdown :global(h3),
  .markdown :global(h4),
  .markdown :global(h5),
  .markdown :global(h6) {
    font-weight: 600;
    line-height: 1.25;
    margin: 0.6em 0 0.3em;
  }
  .markdown :global(h1:first-child),
  .markdown :global(h2:first-child),
  .markdown :global(h3:first-child),
  .markdown :global(h4:first-child),
  .markdown :global(h5:first-child),
  .markdown :global(h6:first-child) {
    margin-top: 0;
  }
  .markdown :global(h1) { font-size: 1.5em; }
  .markdown :global(h2) { font-size: 1.3em; }
  .markdown :global(h3) { font-size: 1.15em; }
  .markdown :global(h4) { font-size: 1em; }
  .markdown :global(h5) { font-size: 0.9em; }
  .markdown :global(h6) { font-size: 0.85em; color: rgba(0,0,0,0.6); }
  .markdown :global(a) {
    color: rgb(37 99 235);
    text-decoration: underline;
  }
  .markdown :global(a:hover) {
    color: rgb(29 78 216);
  }
  .markdown :global(code) {
    background: rgba(0, 0, 0, 0.06);
    padding: 0.1em 0.3em;
    border-radius: 0.25em;
    font-size: 0.9em;
  }
  .markdown :global(pre) {
    background: rgba(0, 0, 0, 0.06);
    padding: 0.5em 0.75em;
    border-radius: 0.375em;
    overflow-x: auto;
  }
  .markdown :global(pre code) {
    background: transparent;
    padding: 0;
  }
  .markdown :global(ul),
  .markdown :global(ol) {
    margin: 0.25em 0;
    padding-left: 1.5em;
  }
  .markdown :global(ul) { list-style: disc; }
  .markdown :global(ol) { list-style: decimal; }
  .markdown :global(blockquote) {
    border-left: 3px solid rgba(0, 0, 0, 0.15);
    padding-left: 0.75em;
    color: rgba(0, 0, 0, 0.7);
    margin: 0.25em 0;
  }
  :global(.dark) .markdown :global(code),
  :global(.dark) .markdown :global(pre) {
    background: rgba(255, 255, 255, 0.08);
  }
  :global(.dark) .markdown :global(blockquote) {
    border-left-color: rgba(255, 255, 255, 0.2);
    color: rgba(255, 255, 255, 0.7);
  }
</style>
