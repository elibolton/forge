<script lang="ts">
  import { Check, Timer } from '@lucide/svelte';
  import { session } from '../lib/session.svelte';
  import { minSec } from '../lib/units';

  let now = $state(Date.now());
  $effect(() => {
    if (session.restEndsAt === null) return;
    const t = setInterval(() => (now = Date.now()), 250);
    return () => clearInterval(t);
  });
  const remaining = $derived(session.restEndsAt === null ? 0 : Math.max(0, Math.ceil((session.restEndsAt - now) / 1000)));
  const fraction = $derived(remaining / Math.max(1, session.restTotal));
  const C = 2 * Math.PI * 16;
</script>

{#if session.restEndsAt !== null}
  <div class="bar">
    <svg width="36" height="36" viewBox="0 0 36 36" aria-hidden="true">
      <circle cx="18" cy="18" r="16" fill="none" stroke="var(--raised)" stroke-width="4" />
      <circle cx="18" cy="18" r="16" fill="none" stroke="var(--accent)" stroke-width="4" stroke-linecap="round"
        stroke-dasharray="{C * fraction} {C}" transform="rotate(-90 18 18)" style="transition: stroke-dasharray 0.25s linear" />
      <foreignObject x="9" y="9" width="18" height="18">
        {#if remaining > 0}<Timer size={18} />{:else}<Check size={18} />{/if}
      </foreignObject>
    </svg>
    <div class="grow" role="timer" aria-live="off">
      <div class="bold mono" style="font-size:1.25rem">{remaining > 0 ? minSec(remaining) : 'Go!'}</div>
      <div class="caption muted">{remaining > 0 ? 'Resting' : 'Rest complete'}</div>
    </div>
    <button class="btn" aria-label="Add 15 seconds" onclick={() => session.extendRest(15)}>+15s</button>
    <button class="btn primary" onclick={() => session.skipRest()}>{remaining > 0 ? 'Skip' : 'Close'}</button>
  </div>
{/if}

<style>
  .bar { display: flex; align-items: center; gap: 14px; padding: 14px; margin: 0 16px; border-radius: 24px;
    background: rgba(44, 44, 46, 0.85); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); }
</style>
