<script lang="ts">
  import ActionMenu from '../components/ActionMenu.svelte';
  import BackBar from '../components/BackBar.svelte';
  import { deleteLog, fmtDate, logSummary, logTitle } from '../lib/logs';
  import { nav } from '../lib/nav.svelte';
  import { app } from '../lib/store.svelte';

  /** Every workout as a list. Long histories render in pages. */
  let shown = $state(60);
</script>

<div class="screen">
  <BackBar title="All Workouts" />
  {#if !app.logs.length}
    <p class="muted" style="text-align:center;padding:25vh 0 0">No workouts yet. Finished workouts show up here.</p>
  {:else}
    <div class="list" style="margin-top:12px">
      {#each app.logs.slice(0, shown) as log (log.id)}
        <div class="item">
          <button class="grow" style="text-align:left" onclick={() => nav.push({ name: 'log', id: log.id })}>
            <div class="row between"><span class="bold">{logTitle(log)}</span><span class="sub muted">{fmtDate(log.date, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span></div>
            <div class="sub muted">{logSummary(log, app.units)}</div>
          </button>
          <ActionMenu label="{logTitle(log)} options" items={[{ label: 'Delete Workout', danger: true, action: () => deleteLog(log) }]}>⋯</ActionMenu>
        </div>
      {/each}
    </div>
    {#if shown < app.logs.length}<button class="btn block" style="margin-top:12px" onclick={() => (shown += 60)}>Show More</button>{/if}
  {/if}
</div>
