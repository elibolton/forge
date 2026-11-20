<script lang="ts">
  import { ChartLine, CircleUser, Dumbbell } from '@lucide/svelte';
  import FinishSummary from './components/FinishSummary.svelte';
  import ProblemScreen from './components/ProblemScreen.svelte';
  import SaveErrorBanner from './components/SaveErrorBanner.svelte';
  import StaleWorkoutSheet from './components/StaleWorkoutSheet.svelte';
  import { saving } from './lib/saving.svelte';
  import MiniBar from './components/MiniBar.svelte';
  import ToastHost from './components/ToastHost.svelte';
  import StaleBanner from './components/StaleBanner.svelte';
  import UpdateBanner from './components/UpdateBanner.svelte';
  import { sync } from './lib/sync.svelte';
  import { updates } from './lib/pwa.svelte';
  import { type Tab, nav } from './lib/nav.svelte';
  import { session } from './lib/session.svelte';
  import { app } from './lib/store.svelte';
  import ActiveWorkout from './screens/ActiveWorkout.svelte';
  import Data from './screens/Data.svelte';
  import ExerciseDetail from './screens/ExerciseDetail.svelte';
  import History from './screens/History.svelte';
  import LogDetail from './screens/LogDetail.svelte';
  import Onboarding from './screens/Onboarding.svelte';
  import Programs from './screens/Programs.svelte';
  import Progress from './screens/Progress.svelte';
  import Settings from './screens/Settings.svelte';
  import Today from './screens/Today.svelte';
  import You from './screens/You.svelte';

  const TABS: { id: Tab; label: string; icon: typeof Dumbbell }[] = [
    { id: 'today', label: 'Today', icon: Dumbbell },
    { id: 'progress', label: 'Progress', icon: ChartLine },
    { id: 'you', label: 'You', icon: CircleUser },
  ];

  import { tick } from 'svelte';
  import { portal } from './lib/portal';

  const route = $derived(nav.top);

  // Put each screen back where it was scrolled to (or the top for a new one).
  $effect(() => {
    void nav.key;
    const y = nav.savedScroll();
    tick().then(() => scrollTo({ top: y, behavior: 'instant' as ScrollBehavior }));
  });

  // Swipe from the left edge to go back, like iOS.
  let screen = $state<HTMLDivElement>();
  let drag: { x: number; y: number; t: number; dx: number; locked: boolean } | null = null;
  function edgeStart(e: TouchEvent) {
    const t = e.touches[0];
    if (!nav.depth || t.clientX > 28) return;
    drag = { x: t.clientX, y: t.clientY, t: performance.now(), dx: 0, locked: false };
  }
  function edgeMove(e: TouchEvent) {
    if (!drag || !screen) return;
    const t = e.touches[0];
    const dx = t.clientX - drag.x, dy = t.clientY - drag.y;
    if (!drag.locked) {
      if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 8) { drag = null; return; }
      if (dx > 8) drag.locked = true; else return;
    }
    drag.dx = Math.max(0, dx);
    e.preventDefault();
    screen.style.transition = 'none';
    screen.style.transform = `translateX(${drag.dx}px)`;
    screen.style.opacity = `${1 - Math.min(0.5, drag.dx / innerWidth)}`;
  }
  // Non-passive so the drag can stop the page scrolling sideways.
  $effect(() => {
    const el = screen;
    if (!el) return;
    el.addEventListener('touchstart', edgeStart, { passive: true });
    el.addEventListener('touchmove', edgeMove, { passive: false });
    el.addEventListener('touchend', edgeEnd);
    el.addEventListener('touchcancel', edgeEnd);
    return () => {
      el.removeEventListener('touchstart', edgeStart);
      el.removeEventListener('touchmove', edgeMove);
      el.removeEventListener('touchend', edgeEnd);
      el.removeEventListener('touchcancel', edgeEnd);
    };
  });

  function edgeEnd() {
    if (!drag || !screen) return;
    const el = screen;
    const velocity = drag.dx / Math.max(1, performance.now() - drag.t);
    const go = drag.locked && (drag.dx > innerWidth * 0.33 || velocity > 0.6);
    drag = null;
    el.style.transition = 'transform 0.25s var(--ease), opacity 0.25s';
    if (go) {
      el.style.transform = `translateX(${innerWidth}px)`;
      el.style.opacity = '0';
      // Leave the departing screen off to the side: going back through history swaps it out a moment
      // later, and resetting it now would flash it back into view first. Only if it's somehow still
      // here after that (the pop didn't happen) put it back.
      setTimeout(() => {
        nav.pop();
        setTimeout(() => { if (el.isConnected) el.style.transition = el.style.transform = el.style.opacity = ''; }, 500);
      }, 200);
    } else {
      el.style.transform = '';
      el.style.opacity = '';
    }
  }
  // Hide the tabs underneath the full-screen logger from assistive tech.
  const loggerOpen = $derived(session.isActive && session.isExpanded);
</script>

<svelte:boundary onerror={(e) => console.error('Forge hit an error', e)}>
{#if !app.ready}
  <div style="min-height:100dvh"></div>
{:else if app.loadError}
  <ProblemScreen title="Couldn't open your data" detail={app.loadError} recover
    message="Your workouts are still on this phone, but Forge couldn't read them just now. Reload to try again. If it keeps happening, restart your phone." />
{:else if !app.profile}
  <Onboarding />
{:else}
  <main inert={loggerOpen}>
    {#key nav.key}
      <div class="nav-screen {nav.direction}" bind:this={screen} role="presentation">
      {#if !route}
        {#if nav.tab === 'today'}<Today />{:else if nav.tab === 'progress'}<Progress />{:else}<You />{/if}
      {:else if route.name === 'exercise'}<ExerciseDetail id={route.id} />
      {:else if route.name === 'log'}<LogDetail id={route.id} />
      {:else if route.name === 'history'}<History />
      {:else if route.name === 'plan'}<You embedded />
      {:else if route.name === 'programs' || route.name === 'program'}<Programs {route} />
      {:else if route.name === 'data'}<Data />
      {:else}<Settings {route} />
      {/if}
      </div>
    {/key}
  </main>

  {#if session.isActive && !session.isExpanded}<MiniBar />{/if}

  <div class="bottom-fade" aria-hidden="true"></div>
  <nav class="dock glass" inert={loggerOpen} aria-label="Tabs">
    {#each TABS as t (t.id)}
      {@const Icon = t.icon}
      {@const on = nav.tab === t.id}
      <button class:on aria-current={on ? 'page' : undefined} aria-label={t.label} onclick={() => nav.select(t.id)}>
        <Icon size={22} strokeWidth={on ? 2.3 : 1.9} aria-hidden="true" />
        <span class="label" aria-hidden="true">{t.label}</span>
      </button>
    {/each}
  </nav>

  {#if loggerOpen}<ActiveWorkout />{/if}
  {#if session.finished}<FinishSummary />{/if}
  {#if session.isActive && session.staleSince !== null}<StaleWorkoutSheet />{/if}
{/if}

{#snippet failed(error)}
  <ProblemScreen title="Something went wrong" detail={error instanceof Error ? error.message : String(error)}
    message="Forge hit an error. A workout in progress is saved as you go, so reloading picks up where you left off." />
{/snippet}
</svelte:boundary>

<!-- Banners and toasts share one column at the top, so none covers another's buttons. On <body>, above any open sheet. -->
<div class="top-stack" use:portal>
  {#if saving.error}<SaveErrorBanner />{/if}
  <!-- Never interrupt a set: the banner waits until the logger is closed. -->
  {#if sync.stale && app.ready && !(session.isActive && session.isExpanded)}<StaleBanner />
  {:else if updates.ready && !(session.isActive && session.isExpanded)}<UpdateBanner />{/if}
  <ToastHost />
</div>

<style>
  .top-stack { position: fixed; top: calc(var(--safe-top) + 10px); left: 12px; right: 12px; z-index: 100; pointer-events: none;
    display: flex; flex-direction: column; align-items: center; gap: 8px; }
  /* A screen sliding in from the side mustn't widen the page (it left a sideways scroll at phone size). */
  main { overflow-x: clip; }
  .nav-screen { will-change: transform; }
  .nav-screen.forward { animation: in-right 0.38s var(--ease); }
  .nav-screen.back { animation: in-left 0.38s var(--ease); }
  .nav-screen :global(.screen) { animation: none; }
  .nav-screen.none :global(.screen) { animation: screen-in 0.3s var(--ease); }
  @keyframes in-right { from { transform: translateX(28%); opacity: 0; } }
  @keyframes in-left { from { transform: translateX(-18%); opacity: 0; } }
  .bottom-fade { position: fixed; left: 0; right: 0; bottom: 0; height: calc(var(--dock-h) + var(--safe-bottom) + 40px); z-index: 39;
    pointer-events: none; background: linear-gradient(to top, var(--bg) 35%, rgba(7, 7, 8, 0)); }
  .dock { position: fixed; left: 50%; transform: translateX(-50%); bottom: var(--safe-bottom); z-index: 40;
    display: flex; gap: 4px; padding: 6px; border-radius: 999px; width: min(340px, calc(100% - 36px)); height: var(--dock-h);
    box-shadow: 0 20px 50px -12px rgba(0, 0, 0, 0.8), inset 0 1px 0 rgba(255, 255, 255, 0.06); }
  .dock button { flex: 1; display: flex; align-items: center; justify-content: center; gap: 7px; border-radius: 999px;
    color: var(--text-3); font-size: 0.85rem; font-weight: 640; transition: flex 0.35s var(--ease), background 0.3s, color 0.3s; }
  .dock button .label { max-width: 0; overflow: hidden; white-space: nowrap; opacity: 0; transition: max-width 0.35s var(--ease), opacity 0.25s; }
  .dock button.on { flex: 1.9; color: var(--on-ember); background: var(--ember-gradient); box-shadow: 0 8px 20px -6px var(--ember-glow), inset 0 1px 0 rgba(255,255,255,.25); }
  .dock button.on .label { max-width: 90px; opacity: 1; }
</style>
