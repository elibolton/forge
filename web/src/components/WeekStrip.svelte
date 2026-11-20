<script lang="ts">
  import { Plus } from '@lucide/svelte';
  import { currentTime } from '../lib/clock.svelte';
  import { app } from '../lib/store.svelte';
  import { countInWeek, goalStreak, trainedDays, weekStart } from '../lib/weeks';
  import ActivitySheet from './ActivitySheet.svelte';

  /** This week at a glance: lifting days against your goal, cardio days, and a quick way to log cardio. */
  let logging = $state(false);
  const now = $derived(currentTime());
  const dates = $derived(app.logs.map((l) => l.date));
  const lifted = $derived(trainedDays(dates, now));
  const cardio = $derived(trainedDays(app.activities.map((a) => a.date), now));
  const done = $derived(countInWeek(dates, weekStart(now)));
  const goal = $derived(app.weeklyGoal);
  const streak = $derived(goalStreak(dates, app.weeklyGoalByWeek, now));
  const today = $derived((new Date(now).getDay() + 6) % 7);
</script>

<section class="week">
  <div class="row between">
    <div class="stack" style="--gap:3px">
      <span class="eyebrow">This week</span>
      <span class="sub"><b class="num">{done}</b><span class="faint" style="margin-left:4px">/ {goal} workouts</span>
        {#if done >= goal}<span class="met"> · goal met</span>{:else if streak}<span class="faint"> · {streak}-week streak</span>{/if}</span>
    </div>
    <button class="chip" onclick={() => (logging = true)}><Plus size={14} /> Cardio</button>
  </div>
  <div class="days" role="list" aria-label="This week">
    {#each ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as d, i (i)}
      <span class="day" role="listitem" class:lift={lifted[i]} class:today={i === today} class:future={i > today}
        aria-label="{['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][i]}{lifted[i] ? ', workout' : ''}{cardio[i] ? ', cardio' : ''}">
        <span aria-hidden="true">{d}</span>
        {#if cardio[i]}<i class="cardio" aria-hidden="true"></i>{/if}
      </span>
    {/each}
    <span class="meter" aria-hidden="true"><b style="width:{Math.min(1, done / goal) * 100}%"></b></span>
  </div>
</section>

{#if logging}<ActivitySheet onclose={() => (logging = false)} />{/if}

<style>
  .week { padding: 14px 16px; border-radius: var(--r-lg); background: var(--surface); border: 1px solid var(--hairline); display: flex; flex-direction: column; gap: 12px; }
  .met { color: var(--fresh); font-weight: 600; }
  .days { position: relative; display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; }
  .day { position: relative; height: 34px; border-radius: 11px; display: grid; place-items: center; font-size: 0.72rem; font-weight: 650;
    color: var(--text-3); background: var(--surface-2); border: 1px solid transparent; }
  .day.future { background: transparent; border: 1px dashed var(--hairline-2); }
  .day.today { border-color: rgba(255, 106, 46, 0.7); color: var(--text); }
  .day.lift { background: var(--ember-gradient); color: var(--on-ember); box-shadow: 0 6px 14px -6px var(--ember-glow); border-color: transparent; }
  .cardio { position: absolute; bottom: 4px; width: 5px; height: 5px; border-radius: 50%; background: #6fa2ff; box-shadow: 0 0 6px rgba(111, 162, 255, 0.8); }
  .day.lift .cardio { background: #fff; }
  .meter { grid-column: 1 / -1; height: 3px; border-radius: 2px; background: var(--surface-2); overflow: hidden; }
  .meter b { display: block; height: 100%; background: var(--ember-gradient); border-radius: 2px; transition: width 0.4s var(--ease); }
</style>
