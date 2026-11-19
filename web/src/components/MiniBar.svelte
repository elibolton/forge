<script lang="ts">
  import { ChevronUp } from '@lucide/svelte';
  import { exerciseOf, numberedSets, session } from '../lib/session.svelte';
  import { minSec } from '../lib/units';
  import ExerciseThumb from './ExerciseThumb.svelte';

  /** The minimized workout above the tab bar; tap to reopen the logger. */
  let now = $state(Date.now());
  $effect(() => { const t = setInterval(() => (now = Date.now()), 1000); return () => clearInterval(t); });

  const ws = $derived(session.state!);
  const current = $derived(ws.exercises[ws.currentIndex]);
  const resting = $derived(session.restEndsAt !== null && session.restEndsAt > now);
  const status = $derived.by(() => {
    if (resting) return `Resting · ${minSec(Math.ceil((session.restEndsAt! - now) / 1000))}`;
    const elapsed = minSec((now - ws.startedAt) / 1000);
    if (!current) return elapsed;
    const working = numberedSets(current.sets);
    // Nothing to count (no working sets yet): "Set 0 of 0" would read as broken.
    if (!working.length) return elapsed;
    const next = Math.min(working.filter((s) => s.done).length + 1, working.length);
    return `Set ${next} of ${working.length} · ${elapsed}`;
  });
</script>

<button class="mini glass" aria-label="Resume workout, {current ? exerciseOf(current).name : ''}" onclick={() => (session.isExpanded = true)}>
  {#if current}<ExerciseThumb exercise={exerciseOf(current)} size={40} />{/if}
  <span class="grow" style="text-align:left">
    <span class="sub bold one">{current ? exerciseOf(current).name : 'Workout in progress'}</span><br />
    <span class="caption mono" style="color:{resting ? 'var(--accent)' : 'var(--muted)'}">{status}</span>
  </span>
  <span class="open"><ChevronUp size={18} /></span>
</button>

<style>
  .mini { position: fixed; left: 50%; transform: translateX(-50%); width: min(420px, calc(100% - 24px)); z-index: 41;
    bottom: calc(var(--safe-bottom) + var(--dock-h) + 10px); display: flex; align-items: center; gap: 12px; padding: 8px 8px 8px 8px;
    border-radius: 22px; border-color: rgba(255, 106, 46, 0.35) !important; box-shadow: 0 20px 40px -12px rgba(0, 0, 0, 0.8), 0 0 30px -12px var(--ember-glow);
    animation: rise 0.4s var(--ease); }
  .mini:active { transform: translateX(-50%) scale(0.98); }
  .one { display: inline-block; max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .open { width: 36px; height: 36px; border-radius: 50%; display: grid; place-items: center; background: var(--ember-gradient); color: #fff; flex: none; }
  @keyframes rise { from { transform: translate(-50%, 20px); opacity: 0; } }
</style>
