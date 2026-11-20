<script lang="ts">
  import { Check } from '@lucide/svelte';

  /** "Trained today" as one line inside the hero, instead of its own card above it. */
  let { detail }: { detail: string } = $props();
</script>

<div class="trained row" style="--gap:8px">
  <span class="tick" aria-hidden="true"><Check size={12} strokeWidth={3.2} /></span>
  <span class="caption one-line"><b>Trained today</b> · {detail}</span>
</div>

<style>
  .trained { color: var(--text-2); }
  .tick { width: 18px; height: 18px; border-radius: 50%; display: grid; place-items: center; background: var(--fresh); color: #062b1e; flex: none; }
  b { color: var(--text); font-weight: 650; }
</style>
