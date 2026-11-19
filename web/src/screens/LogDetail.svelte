<script lang="ts">
  import SaveTemplateSheet from '../components/SaveTemplateSheet.svelte';
  import { templateFromLogged } from '../lib/templates';
  import { Catalog } from '../engine';
  import { Bookmark, ChevronRight, Trophy } from '@lucide/svelte';
  import BackBar from '../components/BackBar.svelte';
  import LogEditor from '../components/LogEditor.svelte';
  import SetLine from '../components/SetLine.svelte';
  import { deleteLog, fmtDate, logTitle } from '../lib/logs';
  import { nav } from '../lib/nav.svelte';
  import { app, logVolume } from '../lib/store.svelte';

  /** A saved workout. Edit opens a draft editor. */
  let { id }: { id: string } = $props();
  let editing = $state(false);
  let saving = $state(false);
  const log = $derived(app.logs.find((l) => l.id === id));

  function remove() {
    const l = log!;
    editing = false;
    nav.pop();
    deleteLog(l);
  }
</script>

<div class="screen">
  <BackBar title={log ? logTitle(log) : 'Workout'}>
    {#snippet trailing()}{#if log}
      <button class="icon-btn plain" aria-label="Save as a workout to do again" onclick={() => (saving = true)}><Bookmark size={18} /></button>
      <button class="link" onclick={() => (editing = true)}>Edit</button>{/if}{/snippet}
  </BackBar>
  {#if log}
    <div class="list" style="margin-top:12px">
      <div class="item">Date <span class="value">{fmtDate(log.date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}, {new Date(log.date).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</span></div>
      {#if log.durationSeconds > 0}<div class="item">Duration <span class="value">{Math.max(1, Math.floor(log.durationSeconds / 60))} min</span></div>{/if}
      {#if logVolume(log) > 0}<div class="item">Volume <span class="value">{app.units.format(logVolume(log))}</span></div>{/if}
    </div>
    {#each log.exercises as logged, i (i)}
      {@const e = Catalog.exercise(logged.exerciseID)}
      {@const isPR = app.prEvents.some((p) => p.logID === log.id && p.exerciseID === e.id)}
      <div class="section">
        <button class="head row link" style="--gap:6px;text-transform:none;font-size:0.95rem" onclick={() => nav.push({ name: 'exercise', id: e.id })}>
          {e.name} {#if isPR}<span class="kicker prbadge"><Trophy size={11} /> PR</span>{/if} <ChevronRight size={14} /></button>
        <div class="list">
          {#each logged.sets as set, j (j)}
            <div class="item"><SetLine {set} exercise={e} label={set.isWarmup ? 'W' : `${logged.sets.slice(0, j).filter((s) => !s.isWarmup).length + 1}`} /></div>
          {/each}
        </div>
      </div>
    {/each}
  {/if}
</div>

{#if saving && log}
  {@const l = log}
  <SaveTemplateSheet suggested={logTitle(l)} make={(n) => templateFromLogged(n, l.exercises)} onclose={() => (saving = false)} />
{/if}
{#if editing && log}
  <LogEditor {log} onclose={() => (editing = false)} ondelete={remove} />
{/if}

<style>
  .prbadge { display: inline-flex; align-items: center; gap: 3px; padding: 3px 7px; border-radius: 6px; color: var(--recovering); background: rgba(255, 187, 69, 0.14); }
</style>
