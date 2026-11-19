<script lang="ts">
  import { ChevronUp } from '@lucide/svelte';
  import { exerciseOf, session } from '../lib/session.svelte';
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
    const working = current.sets.filter((s) => !s.isWarmup);
    const next = Math.min(working.filter((s) => s.done).length + 1, working.length);
    return `Set ${next} of ${working.length} · ${elapsed}`;
  });
</script>

<button class="mini" aria-label="Resume workout, {current ? exerciseOf(current).name : ''}" onclick={() => (session.isExpanded = true)}>
  {#if current}<ExerciseThumb exercise={exerciseOf(current)} size={40} />{/if}
  <span class="grow" style="text-align:left">
    <span class="sub bold one">{current ? exerciseOf(current).name : 'Workout in progress'}</span><br />
    <span class="caption mono" style="color:{resting ? 'var(--accent)' : 'var(--muted)'}">{status}</span>
  </span>
  <ChevronUp size={20} color="var(--muted)" />
</button>

<style>
  .mini { position: fixed; left: 16px; right: 16px; bottom: calc(var(--tabbar-h) + var(--safe-bottom) + 8px); z-index: 30;
    display: flex; align-items: center; gap: 12px; padding: 12px; border-radius: 22px; max-width: 688px; margin: 0 auto;
    background: rgba(44, 44, 46, 0.9); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); border: 1px solid rgba(255, 107, 46, 0.35); }
  .one { display: inline-block; max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style>
