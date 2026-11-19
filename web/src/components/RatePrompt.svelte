<script lang="ts">
  import { X } from '@lucide/svelte';
  import { exerciseOf, session } from '../lib/session.svelte';
  import { isPerSide } from '../engine';
  import RIRChips from './RIRChips.svelte';

  /**
   * Right after logging a set, while resting: one tap for how many reps were left. Optional; logging
   * the next set or tapping × moves on without it.
   */
  const target = $derived.by(() => {
    const p = session.pendingRating;
    const ex = p && session.state?.exercises.find((x) => x.id === p.exerciseID);
    const set = ex?.sets.find((x) => x.id === p!.setID);
    if (!ex || !set?.done) return null;
    const working = ex.sets.filter((x) => !x.isWarmup);
    const i = working.findIndex((x) => x.id === set.id);
    const number = ex.program && isPerSide(ex.program.laterality) ? Math.floor(i / 2) + 1 : i + 1;
    return { ex, set, number };
  });
</script>

{#if target}
  {@const t = target}
  <div class="prompt glass" role="group" aria-label="Rate set {t.number}">
    <div class="row" style="--gap:8px">
      <span class="sub semibold grow one-line">Reps left on set {t.number}{' '}<span class="muted">· {exerciseOf(t.ex).name}</span></span>
      <button class="skip" aria-label="Skip rating" onclick={() => session.skipRating()}><X size={16} /></button>
    </div>
    <RIRChips compact value={t.set.rir} label="Reps left on set {t.number}" onpick={(v) => session.rateSet(t.ex.id, t.set.id, v)} />
  </div>
{/if}

<style>
  .prompt { display: flex; flex-direction: column; gap: 10px; margin: 0 12px 8px; padding: 12px 12px 12px 16px; border-radius: var(--r-lg);
    animation: rise 0.3s var(--ease); }
  .skip { width: 36px; height: 36px; margin: -6px -4px -6px 0; border-radius: 50%; display: grid; place-items: center; color: var(--text-2); flex: none; }
  @keyframes rise { from { transform: translateY(20px); opacity: 0; } }
</style>
