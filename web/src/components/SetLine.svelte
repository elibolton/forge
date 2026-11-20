<script lang="ts">
  import type { Exercise, LoggedSet } from '../engine';
  import { ChevronUp } from '@lucide/svelte';
  import { app } from '../lib/store.svelte';

  /** One logged set as a line: number, load × reps and reps in reserve. */
  let { set, label, exercise, selected = false }: { set: LoggedSet; label: string; exercise: Exercise; selected?: boolean } = $props();
  const reps = $derived(exercise.isTimed ? `${set.reps}s` : `${set.reps}`);
</script>

<span class="row" style="width:100%">
  <span class="badge" class:on={selected}>{label}</span>
  <span class="semibold mono grow">{set.weight > 0 ? app.units.format(set.weight) : 'BW'} × {reps}</span>
  {#if set.type === 'failure'}<span class="caption failure">failure</span>
  {:else if set.type === 'drop'}<span class="caption muted">drop</span>
  {:else if set.rir != null && !set.isWarmup}
    <!-- Plain words rather than "RIR": the logger asks "Reps left on set N". -->
    <span class="caption muted mono" title="Reps left: how many more you could have done">{set.rir === 0 ? 'to failure' : `${set.rir >= 4 ? '4+' : set.rir} left`}</span>{/if}
  {#if selected}<ChevronUp size={16} color="var(--accent)" />{/if}
</span>

<style>
  .badge { min-width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; font-size: 0.75rem; font-weight: 700; background: var(--raised); }
  .badge.on { background: var(--accent); }
  .failure { color: var(--fatigued); font-weight: 600; }
</style>
