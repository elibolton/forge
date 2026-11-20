<script lang="ts">
  import { session } from '../lib/session.svelte';
  import { app } from '../lib/store.svelte';
  import { announce } from '../lib/announce';
  import { minSec } from '../lib/units';

  /** Docked rest timer: a big countdown with a draining bar, +15 s and skip. */
  let now = $state(Date.now());
  $effect(() => {
    if (session.restEndsAt === null) return;
    const t = setInterval(() => (now = Date.now()), 200);
    return () => clearInterval(t);
  });
  /** Seconds since rest ended, so coming back to the app later shows how long you've been sitting. */
  const over = $derived(session.restEndsAt === null ? 0 : Math.max(0, Math.floor((now - session.restEndsAt) / 1000)));
  const remaining = $derived(session.restEndsAt === null ? 0 : Math.max(0, Math.ceil((session.restEndsAt - now) / 1000)));
  const fraction = $derived(session.restEndsAt === null ? 0 : Math.max(0, (session.restEndsAt - now) / 1000 / Math.max(1, session.restTotal)));

  // The countdown isn't read every tick (aria-live off), but its end is said once.
  let wasCounting = false;
  $effect(() => {
    const counting = session.restEndsAt !== null && remaining > 0;
    if (wasCounting && !counting && session.restEndsAt !== null) announce('Rest over');
    wasCounting = counting;
  });

  // Once ever, during the first rest: the iPhone silent switch mutes the timer sound.
  let silentTip = $state(false);
  $effect(() => {
    const resting = session.restEndsAt !== null;
    if (resting && !app.get('silentTipShown') && (app.get('restSound') ?? 'chime') !== 'off') silentTip = true;
    else if (!resting && silentTip) { app.set('silentTipShown', true); silentTip = false; }
  });
</script>

{#if session.restEndsAt !== null}
  <div class="rest" class:ready={remaining === 0}>
    <div class="bar" aria-hidden="true"><i style="transform:scaleX({fraction})"></i></div>
    <div class="row" style="--gap:12px">
      <div class="grow" role="timer" aria-live="off">
        <div class="eyebrow">{remaining > 0 ? 'Rest' : over >= 5 ? 'Rest ended' : 'Rest complete'}</div>
        <div class="num time">{remaining > 0 ? minSec(remaining) : over >= 5 ? `+${minSec(over)}` : 'Go'}</div>
      </div>
      <button class="btn" aria-label="Add 15 seconds" onclick={() => session.extendRest(15)}>+15s</button>
      <button class="btn" onclick={() => session.skipRest()}>{remaining > 0 ? 'Skip' : 'Close'}</button>
    </div>
    {#if silentTip}<div class="caption muted tip">On iPhone, silent mode mutes the rest sound.</div>{/if}
  </div>
{/if}

<style>
  /* Drawn inside the logger's rest card (see ActiveWorkout); the drain bar runs along that card's top. */
  .rest { animation: rise 0.4s var(--ease); }
  .bar { position: absolute; left: 0; right: 0; top: 0; height: 3px; background: var(--surface-2); }
  .bar i { display: block; height: 100%; background: var(--ember-gradient); transform-origin: left; transition: transform 0.2s linear;
    box-shadow: 0 0 12px var(--ember-glow); }
  .time { font-size: 1.9rem; font-stretch: 125%; font-weight: 800; line-height: 1; margin-top: 3px; }
  .ready .time { color: var(--fresh); }
  .tip { margin-top: 8px; }
  @keyframes rise { from { transform: translateY(30px); opacity: 0; } }
</style>
