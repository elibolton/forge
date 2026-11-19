<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { Exercise } from '../engine';
  import ExerciseThumb from './ExerciseThumb.svelte';

  /** One exercise in today's sequence: order, tile, name, prescription pills and extra detail. */
  let { index, exercise, tag, pills, detail, menu, onopen, dim = false }: {
    index: number; exercise: Exercise; tag?: { text: string; tone?: 'ember' | 'amber' | 'muted' }[]; pills: string[];
    detail?: Snippet; menu?: Snippet; onopen: () => void; dim?: boolean;
  } = $props();
</script>

<article class="ex" class:dim>
  <div class="top">
    <button class="main" onclick={onopen}>
      <span class="tile"><ExerciseThumb {exercise} size={48} /><span class="idx num">{index + 1}</span></span>
      <span class="stack grow" style="--gap:6px">
        {#if tag?.length}
          <span class="row" style="--gap:6px">{#each tag as t (t.text)}<span class="kicker tag {t.tone ?? 'ember'}">{t.text}</span>{/each}</span>
        {/if}
        <span class="name">{exercise.name}</span>
        <span class="pills mono">{#each pills as p, i (p)}{#if i}<span class="dot" aria-hidden="true">·</span>{/if}<span class:lead={i === 0}>{p}</span>{/each}</span>
      </span>
    </button>
    {#if menu}<div class="menu">{@render menu()}</div>{/if}
  </div>
  {#if detail}<div class="detail">{@render detail()}</div>{/if}
</article>

<style>
  .ex { padding: 14px 8px 14px 14px; border-radius: var(--r-lg); background: linear-gradient(180deg, rgba(255, 255, 255, 0.045), rgba(255, 255, 255, 0.018));
    border: 1px solid var(--hairline); }
  .ex.dim { opacity: 0.5; }
  .top { display: flex; align-items: center; gap: 4px; }
  .main { flex: 1; display: flex; gap: 14px; align-items: center; text-align: left; min-width: 0; }
  .main:active { transform: none; opacity: 0.75; }
  .tile { position: relative; flex: none; }
  .idx { position: absolute; top: -6px; left: -6px; min-width: 20px; height: 20px; padding: 0 5px; border-radius: 10px; display: grid; place-items: center;
    font-size: 0.66rem; background: #0b0b0d; border: 1px solid var(--hairline-2); color: var(--text-2); }
  .name { font-weight: 650; font-size: 1.02rem; letter-spacing: -0.015em; line-height: 1.2; }
  .pills { font-size: 0.84rem; color: var(--text-3); display: flex; flex-wrap: wrap; gap: 0 6px; }
  .pills .lead { color: var(--text); font-weight: 650; }
  .pills span:nth-child(3) { color: var(--text-2); font-weight: 600; }
  .tag { padding: 3px 7px; border-radius: 6px; }
  .tag.ember { color: var(--ember-2); background: var(--ember-soft); }
  .tag.amber { color: var(--recovering); background: rgba(255, 187, 69, 0.12); }
  .tag.muted { color: var(--text-3); background: var(--surface-2); }
  .detail { margin: 10px 6px 0 62px; }
</style>
