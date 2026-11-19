<script lang="ts">
  import { session } from '../lib/session.svelte';
  import { minSec } from '../lib/units';

  /** Docked rest timer: a big countdown with a draining bar, +15 s and skip. */
  let now = $state(Date.now());
  $effect(() => {
    if (session.restEndsAt === null) return;
    const t = setInterval(() => (now = Date.now()), 200);
    return () => clearInterval(t);
  });
  const remaining = $derived(session.restEndsAt === null ? 0 : Math.max(0, Math.ceil((session.restEndsAt - now) / 1000)));
  const fraction = $derived(session.restEndsAt === null ? 0 : Math.max(0, (session.restEndsAt - now) / 1000 / Math.max(1, session.restTotal)));
</script>

{#if session.restEndsAt !== null}
  <div class="rest glass" class:ready={remaining === 0}>
    <div class="bar" aria-hidden="true"><i style="transform:scaleX({fraction})"></i></div>
    <div class="row" style="--gap:12px">
      <div class="grow" role="timer" aria-live="off">
        <div class="eyebrow">{remaining > 0 ? 'Rest' : 'Rest complete'}</div>
        <div class="num time">{remaining > 0 ? minSec(remaining) : 'Go'}</div>
      </div>
      <button class="btn" aria-label="Add 15 seconds" onclick={() => session.extendRest(15)}>+15s</button>
      <button class="btn primary" onclick={() => session.skipRest()}>{remaining > 0 ? 'Skip' : 'Close'}</button>
    </div>
  </div>
{/if}

<style>
  .rest { position: relative; overflow: hidden; margin: 0 12px 4px; padding: 16px 16px 14px 20px; border-radius: var(--r-xl);
    box-shadow: 0 -10px 40px -10px rgba(0, 0, 0, 0.8); animation: rise 0.4s var(--ease); }
  .rest.ready { border-color: rgba(60, 239, 176, 0.45); }
  .bar { position: absolute; left: 0; right: 0; top: 0; height: 3px; background: var(--surface-2); }
  .bar i { display: block; height: 100%; background: var(--ember-gradient); transform-origin: left; transition: transform 0.2s linear;
    box-shadow: 0 0 12px var(--ember-glow); }
  .time { font-size: 2.3rem; font-stretch: 125%; font-weight: 800; line-height: 1; margin-top: 4px; }
  .ready .time { color: var(--fresh); }
  @keyframes rise { from { transform: translateY(30px); opacity: 0; } }
</style>
