<script lang="ts">
  import { Minus, Plus } from '@lucide/svelte';

  /** A big numeral with − and + on either side; tap the number to type it. */
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

<div class="dial">
  <span class="eyebrow" aria-hidden="true">{title}</span>
  <input class="num value" type="text" inputmode={decimals ? 'decimal' : 'numeric'} value={shown} aria-label="{title} in {unit}"
    style="font-size:{shown.length > 4 ? 2.3 : shown.length > 3 ? 2.7 : 3.1}rem"
    onchange={input} onfocus={(e) => (e.currentTarget as HTMLInputElement).select()} />
  <span class="caption faint" aria-hidden="true">{unit}</span>
  <div class="steps">
    <button aria-label="Decrease {title}" onclick={() => onchange(Math.max(0, round(value - step)))}><Minus size={20} strokeWidth={2.6} /></button>
    <button aria-label="Increase {title}" onclick={() => onchange(round(value + step))}><Plus size={20} strokeWidth={2.6} /></button>
  </div>
</div>

<style>
  .dial { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 14px 10px 10px;
    border-radius: var(--r-lg); background: rgba(0, 0, 0, 0.28); border: 1px solid var(--hairline); }
  .value { background: transparent !important; border: 0 !important; text-align: center; padding: 0 !important; min-height: 0 !important;
    height: 3.4rem; line-height: 1; font-stretch: 125%; font-weight: 800; letter-spacing: -0.03em; width: 100%; }
  .steps { display: flex; gap: 8px; width: 100%; margin-top: 10px; }
  .steps button { flex: 1; height: 44px; border-radius: 14px; display: grid; place-items: center; background: var(--surface-2);
    border: 1px solid var(--hairline); }
  .steps button:active { background: var(--surface-3); }
</style>
