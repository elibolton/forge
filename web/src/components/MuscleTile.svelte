<script lang="ts">
  import { type Muscle, muscleName } from '../engine';
  import RecoveryRing from './RecoveryRing.svelte';

  let { muscle, value, fill = false, onclick }: { muscle: Muscle; value: number; fill?: boolean; onclick?: () => void } = $props();
</script>

<svelte:element this={onclick ? 'button' : 'div'} class="tile" class:fill {onclick} role={onclick ? undefined : 'group'}
  aria-label="{muscleName(muscle)}, {Math.round(value * 100)} percent recovered">
  <RecoveryRing {value} />
  <span class="caption semibold" aria-hidden="true">{muscleName(muscle)}</span>
</svelte:element>

<style>
  .tile { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 12px 6px; min-width: 86px; background: var(--card);
    border-radius: 18px; text-align: center; flex: none; }
  .tile.fill { min-width: 0; width: 100%; }
</style>
