<script lang="ts">
  import { ChartLine, CircleUser, Dumbbell } from '@lucide/svelte';
  import FinishSummary from './components/FinishSummary.svelte';
  import MiniBar from './components/MiniBar.svelte';
  import ToastHost from './components/ToastHost.svelte';
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

  const route = $derived(nav.top);
  // Hide the tabs underneath the full-screen logger from assistive tech.
  const loggerOpen = $derived(session.isActive && session.isExpanded);
</script>

{#if !app.ready}
  <div style="min-height:100dvh"></div>
{:else if !app.profile}
  <Onboarding />
{:else}
  <main inert={loggerOpen}>
    {#key `${nav.tab}:${nav.stacks[nav.tab].length}`}
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
    {/key}
  </main>

  {#if session.isActive && !session.isExpanded}<MiniBar />{/if}

  <nav class="tabbar" inert={loggerOpen} aria-label="Tabs">
    {#each TABS as t (t.id)}
      {@const Icon = t.icon}
      <button class:on={nav.tab === t.id} aria-current={nav.tab === t.id ? 'page' : undefined} onclick={() => nav.select(t.id)}>
        <Icon size={24} strokeWidth={nav.tab === t.id ? 2.4 : 1.8} aria-hidden="true" />
        <span>{t.label}</span>
      </button>
    {/each}
  </nav>

  {#if loggerOpen}<ActiveWorkout />{/if}
  {#if session.finished}<FinishSummary />{/if}
{/if}

<ToastHost />

<style>
  .tabbar { position: fixed; left: 0; right: 0; bottom: 0; z-index: 40; display: flex; justify-content: space-around;
    padding: 6px 8px calc(var(--safe-bottom) + 4px); background: rgba(22, 22, 24, 0.88);
    backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); border-top: 0.5px solid var(--line); }
  .tabbar button { flex: 1; max-width: 140px; display: flex; flex-direction: column; align-items: center; gap: 2px; color: var(--muted);
    font-size: 0.66rem; font-weight: 600; min-height: 44px; }
  .tabbar button.on { color: var(--accent); }
</style>
