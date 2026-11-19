<script lang="ts">
  /** Five big targets for "how many more reps could you have done?": 0 (failure) to 4+ (easy). */
  let { value, onpick, label, compact = false }: {
    value: number | null | undefined; onpick: (v: number) => void; label: string; compact?: boolean;
  } = $props();

  const hint = (v: number) => (v === 0 ? 'failure' : v === 1 ? 'one' : v === 4 ? 'easy' : '');
</script>

<div class="rirs" class:compact role="radiogroup" aria-label={label}>
  {#each [0, 1, 2, 3, 4] as v (v)}
    <button class="rir num" class:on={value === v} role="radio" aria-checked={value === v}
      aria-label={v === 0 ? 'None, went to failure' : v === 4 ? '4 or more reps left' : `${v} ${v === 1 ? 'rep' : 'reps'} left`}
      onclick={() => onpick(v)}>{v === 4 ? '4+' : v}{#if !compact}<small>{hint(v)}</small>{/if}</button>
  {/each}
</div>

<style>
  .rirs { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; }
  .rir { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; padding: 12px 0 8px; min-height: 48px;
    border-radius: 16px; background: rgba(0, 0, 0, 0.25); border: 1px solid var(--hairline); font-size: 1.3rem; touch-action: manipulation; }
  .compact .rir { padding: 0; font-size: 1.15rem; border-radius: 14px; }
  .rir small { font-family: var(--font); font-size: 0.6rem; font-weight: 600; color: var(--text-3); min-height: 0.8em; }
  .rir.on { background: var(--ember-gradient); border-color: transparent; color: #fff; box-shadow: 0 10px 24px -8px var(--ember-glow); }
  .rir.on small { color: rgba(255, 255, 255, 0.8); }
</style>
