<script lang="ts">
  import { Minus, Plus } from '@lucide/svelte';

  /** Big number with − and + buttons; type to set it directly. */
  let { title, value, step, unit, decimals, onchange }: {
    title: string; value: number; step: number; unit: string; decimals: boolean; onchange: (v: number) => void;
  } = $props();

  const round = (v: number) => (decimals ? Math.round(v * 10) / 10 : Math.round(v));
  const shown = $derived(String(round(value)));

  function input(e: Event) {
    const raw = (e.currentTarget as HTMLInputElement).value.replace(',', '.');
    const n = Number(raw);
    if (raw !== '' && Number.isFinite(n)) onchange(Math.max(0, round(n)));
  }
</script>

<div class="stepper">
  <div class="kicker muted" aria-hidden="true">{title.toUpperCase()}</div>
  <input class="display mono" type="text" inputmode={decimals ? 'decimal' : 'numeric'} value={shown} aria-label={title}
    onchange={input} onfocus={(e) => (e.currentTarget as HTMLInputElement).select()} />
  <div class="caption semibold muted" aria-hidden="true">{unit}</div>
  <div class="row" style="--gap:8px">
    <button class="step" aria-label="Decrease {title}" onclick={() => onchange(Math.max(0, round(value - step)))}><Minus size={22} strokeWidth={2.6} /></button>
    <button class="step" aria-label="Increase {title}" onclick={() => onchange(round(value + step))}><Plus size={22} strokeWidth={2.6} /></button>
  </div>
</div>

<style>
  .stepper { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 12px;
    background: var(--raised); border-radius: 20px; }
  input { background: transparent !important; text-align: center; font-size: 2.1rem; padding: 0 !important; min-height: 0 !important; }
  .row { width: 100%; }
  .step { flex: 1; min-height: 44px; display: grid; place-items: center; background: var(--card); border-radius: 12px; }
</style>
