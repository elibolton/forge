<script lang="ts">
  import type { Snippet } from 'svelte';

  /** Date eyebrow over a greeting, with actions on the right. */
  let { actions, title }: { actions?: Snippet; title?: string } = $props();
  const now = new Date();
  const date = now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' });
  const hour = now.getHours();
  const greeting = hour < 5 ? 'Late session' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
</script>

<header class="row between">
  <div class="stack" style="--gap:4px">
    <span class="eyebrow">{date}</span>
    <span class="greet">{title ?? greeting}</span>
  </div>
  {#if actions}<div class="row" style="--gap:8px">{@render actions()}</div>{/if}
</header>

<style>
  header { min-height: 56px; padding-top: 4px; }
  .greet { font-family: var(--font-display); font-stretch: 112%; font-weight: 700; font-size: 1.2rem; letter-spacing: -0.01em; }
</style>
