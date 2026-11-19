<script lang="ts">
  import { EQUIPMENT, GOALS, type Gym, Gyms, LEVELS, SPLITS, type Split, defaultPlan, uuid } from '../engine';
  import { Building2, ChevronLeft, ChevronRight, Circle, CircleCheck, Footprints, House, Zap, Share, SquarePlus, Download } from '@lucide/svelte';
  import Sheet from '../components/Sheet.svelte';
  import Toggle from '../components/Toggle.svelte';
  import { equipmentTitle, goalBlurb, goalTitle, levelBlurb, levelTitle, splitBlurb, splitTitle } from '../lib/labels';
  import { app } from '../lib/store.svelte';

  /** First-run setup: one decision per page, every page pre-filled so Next always works. */
  const PAGES = ['goal', 'schedule', 'experience', 'gym', 'finish'] as const;
  const recommendedSplit = (days: number): Split => (days <= 3 ? 'fullBody' : days === 4 ? 'upperLower' : 'pushPullLegs');
  const PRESETS = [
    { title: 'Full Gym', detail: 'Barbells, racks, cables and machines', icon: Building2, gym: Gyms.commercial },
    { title: 'Home Gym', detail: 'Dumbbells, bench, pull-up bar, bands', icon: House, gym: Gyms.home },
    { title: 'No Equipment', detail: 'Bodyweight moves only', icon: Footprints, gym: Gyms.bodyweight },
  ];

  let page = $state(0);
  let plan = $state(defaultPlan({ split: recommendedSplit(3) }));
  let days = $state(3);
  let preset = $state(0);
  let gym = $state<Gym>(PRESETS[0].gym());
  let pounds = $state(/^en-US|^en-LR|^my/.test(navigator.language));
  let editingGym = $state(false);

  const isStandalone = matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
  const gymName = $derived(gym.name.trim() || PRESETS[preset].gym().name);
  const summary = $derived(`${goalTitle[plan.goal]} · ${splitTitle[plan.split]} · ${plan.sessionMinutes} min · ${levelTitle[plan.experience]} · ${gymName}`);

  function finish() {
    const g = { ...$state.snapshot(gym), id: uuid(), usesPounds: pounds, name: gymName, increments: {} };
    app.createProfile($state.snapshot(plan), g, pounds);
  }
</script>

{#snippet option(title: string, detail: string, selected: boolean, onclick: () => void, Icon?: typeof Zap)}
  <button class="card option" class:selected aria-pressed={selected} {onclick}>
    {#if Icon}<span class="ico"><Icon size={22} /></span>{/if}
    <span class="grow" style="text-align:left"><span class="bold">{title}</span><br /><span class="sub muted">{detail}</span></span>
    {#if selected}<CircleCheck size={24} color="var(--accent)" />{:else}<Circle size={24} color="var(--muted)" />{/if}
  </button>
{/snippet}

{#snippet pageTitle(title: string, subtitle: string)}
  <div class="stack" style="--gap:8px;margin:4px 0 8px">
    <h1 class="display" style="font-size:1.75rem">{title}</h1>
    <p class="muted">{subtitle}</p>
  </div>
{/snippet}

<div class="onboarding">
  <div class="dots" aria-label="Step {page + 1} of {PAGES.length}">
    {#each PAGES as _, i (i)}<span class:on={i <= page} class:now={i === page}></span>{/each}
    {#if page < 4}<button class="skip muted" onclick={() => (page = 4)}>Skip</button>{/if}
  </div>

  <div class="body stack">
    {#if PAGES[page] === 'goal'}
      {@render pageTitle("What's your goal?", 'Forge builds every workout around it. You can change this anytime in You.')}
      {#each GOALS as g (g)}{@render option(goalTitle[g], goalBlurb[g], plan.goal === g, () => (plan.goal = g))}{/each}
    {:else if PAGES[page] === 'schedule'}
      {@render pageTitle('Your schedule', 'How often and how long you can train.')}
      <div class="card stack">
        <div class="bold">Days per week</div>
        <div class="row" style="--gap:8px">
          {#each [2, 3, 4, 5, 6] as n (n)}
            <button class="day" class:on={days === n} aria-pressed={days === n} aria-label="{n} days"
              onclick={() => { days = n; plan.split = recommendedSplit(n); }}>{n}</button>
          {/each}
        </div>
      </div>
      <div class="card stack">
        <div class="bold">Split</div>
        <p class="sub muted">We recommend {splitTitle[recommendedSplit(days)]} for {days} days a week.</p>
        <div class="row wrap" style="--gap:8px">
          {#each SPLITS as s (s)}<button class="chip" class:on={plan.split === s} aria-pressed={plan.split === s} onclick={() => (plan.split = s)}>{splitTitle[s]}</button>{/each}
        </div>
        <p class="caption muted">{splitBlurb[plan.split]}</p>
      </div>
      <div class="card stack">
        <div class="row between"><span class="bold">Session length</span><span class="display accent mono" style="font-size:1.35rem">{plan.sessionMinutes} min</span></div>
        <input type="range" min="15" max="90" step="5" bind:value={plan.sessionMinutes} aria-label="Session length" aria-valuetext="{plan.sessionMinutes} minutes" />
        <div class="row between caption muted"><span>15</span><span>90</span></div>
      </div>
    {:else if PAGES[page] === 'experience'}
      {@render pageTitle('How experienced are you?', 'Sets starting volume and how hard Forge pushes progression.')}
      {#each LEVELS as l (l)}{@render option(levelTitle[l], levelBlurb[l], plan.experience === l, () => (plan.experience = l))}{/each}
    {:else if PAGES[page] === 'gym'}
      {@render pageTitle('Where do you train?', 'Forge only suggests exercises you have the equipment for.')}
      {#each PRESETS as p, i (i)}{@render option(p.title, p.detail, preset === i, () => { preset = i; gym = p.gym(); }, p.icon)}{/each}
      <div class="list">
        <label class="item"><span class="muted">Name</span><input type="text" bind:value={gym.name} placeholder={PRESETS[preset].gym().name} style="text-align:right;background:transparent" /></label>
        <button class="item" onclick={() => (editingGym = true)}>Customize equipment <span class="value mono">{gym.equipment.length}</span><ChevronRight size={16} color="var(--muted)" /></button>
      </div>
      <div class="card stack" style="margin-top:20px">
        <div class="bold">Units</div>
        <p class="sub muted">Used for your weights and plate math.</p>
        <div class="segmented" role="radiogroup" aria-label="Units">
          <button role="radio" aria-checked={pounds} class:on={pounds} onclick={() => (pounds = true)}>Pounds</button>
          <button role="radio" aria-checked={!pounds} class:on={!pounds} onclick={() => (pounds = false)}>Kilograms</button>
        </div>
      </div>
    {:else}
      {@render pageTitle("You're all set", summary)}
      {#if !isStandalone}
        <div class="card stack">
          <div class="row bold" style="--gap:8px"><Download size={20} /> Add Forge to your Home Screen</div>
          <p class="sub muted">It then opens full screen like an app and works offline at the gym.</p>
          <ol class="sub steps">
            <li>Tap <Share size={16} style="vertical-align:-3px" /> <b>Share</b> in Safari's toolbar.</li>
            <li>Choose <SquarePlus size={16} style="vertical-align:-3px" /> <b>Add to Home Screen</b>.</li>
            <li>Open Forge from your Home Screen.</li>
          </ol>
          <p class="caption muted">Each copy keeps its own data, so finish setup in the Home Screen app.</p>
        </div>
      {/if}
      <p class="caption muted">Coming from another app? Import your workout history from You → Data after setup.</p>
    {/if}
  </div>

  <footer class="row">
    {#if page > 0}<button class="back" aria-label="Back" onclick={() => page--}><ChevronLeft /></button>{/if}
    <span class="grow"></span>
    {#if page === 4}
      <button class="go" onclick={finish}><Zap size={20} fill="currentColor" /> Build My First Workout</button>
    {:else}
      <button class="go" onclick={() => page++}>Next <ChevronRight size={20} /></button>
    {/if}
  </footer>
</div>

{#if editingGym}
  <Sheet title="Equipment" onclose={() => (editingGym = false)}>
    {#snippet leading()}<span></span>{/snippet}
    {#snippet trailing()}<button class="link bold" onclick={() => (editingGym = false)}>Done</button>{/snippet}
    <div class="list">
      {#each EQUIPMENT as eq (eq)}
        <Toggle label={equipmentTitle[eq]} checked={gym.equipment.includes(eq)}
          onchange={(on) => (gym.equipment = on ? [...gym.equipment, eq] : gym.equipment.filter((x) => x !== eq))} />
      {/each}
    </div>
  </Sheet>
{/if}

<style>
  .onboarding { min-height: 100dvh; display: flex; flex-direction: column; max-width: 640px; margin: 0 auto; padding: calc(var(--safe-top) + 8px) 20px calc(var(--safe-bottom) + 12px); }
  .dots { display: flex; justify-content: center; align-items: center; gap: 8px; padding: 12px 0; position: relative; min-height: 44px; }
  .dots span { width: 8px; height: 8px; border-radius: 4px; background: var(--raised); transition: width 0.2s; }
  .dots span.on { background: var(--accent); }
  .dots span.now { width: 22px; }
  .skip { position: absolute; right: 0; min-height: 44px; }
  .body { flex: 1; padding-bottom: 24px; }
  .option { display: flex; align-items: center; gap: 14px; border: 2px solid transparent; width: 100%; }
  .option.selected { border-color: var(--accent); }
  .ico { width: 44px; height: 44px; border-radius: 12px; display: grid; place-items: center; background: var(--raised); color: var(--accent); flex: none; }
  .selected .ico { background: var(--accent); color: #fff; }
  .day { flex: 1; min-height: 48px; border-radius: 14px; background: var(--raised); font-weight: 700; font-size: 1.2rem; }
  .day.on { background: var(--accent); color: #fff; }
  .steps { margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 6px; }
  footer { position: sticky; bottom: 0; padding: 12px 0 calc(var(--safe-bottom) + 12px); margin-bottom: calc(-1 * (var(--safe-bottom) + 12px));
    background: linear-gradient(to bottom, transparent, var(--bg) 30%); }
  .back { width: 54px; height: 54px; border-radius: 50%; background: var(--raised); display: grid; place-items: center; }
  .go { white-space: nowrap; display: inline-flex; align-items: center; gap: 8px; padding: 16px 28px; border-radius: 999px; background: var(--accent); color: #fff; font-weight: 700; font-size: 1.05rem;
    box-shadow: 0 8px 24px rgba(255, 107, 46, 0.45); }
</style>
