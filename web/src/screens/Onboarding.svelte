<script lang="ts">
  import { EQUIPMENT, GOALS, type Gym, Gyms, LEVELS, SPLITS, type Split, defaultPlan, uuid, withGymUnits } from '../engine';
  import { canPull } from '../lib/gymFit';
  import { Building2, ChevronLeft, Dumbbell, ChevronRight, Circle, CircleCheck, Footprints, House, TriangleAlert, Zap, Download } from '@lucide/svelte';
  import Sheet from '../components/Sheet.svelte';
  import Toggle from '../components/Toggle.svelte';
  import InstallSteps from '../components/InstallSteps.svelte';
  import { browserName, device, isStandalone, separateAppData } from '../lib/install.svelte';
  import { EQUIPMENT_GROUPS, equipmentTitle, goalBlurb, goalTitle, levelBlurb, levelTitle, splitBlurb, splitTitle } from '../lib/labels';
  import { app } from '../lib/store.svelte';

  /** First-run setup: one decision per page, every page pre-filled so Next always works. */
  const PAGES = ['goal', 'schedule', 'experience', 'gym', 'finish'] as const;
  const recommendedSplit = (days: number): Split => (days <= 3 ? 'fullBody' : days === 4 ? 'upperLower' : 'pushPullLegs');
  const PRESETS = [
    { title: 'Full Gym', detail: 'Barbells, racks, cables and machines', icon: Building2, gym: Gyms.commercial },
    { title: 'Home Gym (Barbell + Cables)', detail: 'Barbell, rack, dumbbells, bench, dip station, pulldown and row', icon: Dumbbell, gym: Gyms.homeBarbell },
    { title: 'Home Gym', detail: 'Dumbbells, kettlebell, adjustable bench, pull-up bar, bands', icon: House, gym: Gyms.home },
    { title: 'No Equipment', detail: 'Bodyweight moves only', icon: Footprints, gym: Gyms.bodyweight },
  ];

  let page = $state(0);
  let plan = $state(defaultPlan({ split: recommendedSplit(3) }));
  let days = $state(3);
  let preset = $state(0);
  let gym = $state<Gym>(PRESETS[0].gym());
  let pounds = $state(/^en-US|^en-LR|^my/.test(navigator.language));
  let editingGym = $state(false);

  /**
   * On a phone, in a browser tab, setup starts with installing. On iPhone the Home Screen app keeps its
   * own data, so setting up here first would mean doing it twice (or training in a tab whose data
   * Safari can clear). On Android the app shares the browser's data, so it's a suggestion.
   * Computers go straight to setup.
   */
  let installFirst = $state(!isStandalone() && device.os !== 'other');
  const browser = browserName[device.browser];
  const gymName = $derived(gym.name.trim() || PRESETS[preset].gym().name);
  /** No way to pull: say so up front rather than let pull days quietly come up nearly empty. */
  const cantPull = $derived(!canPull(gym));
  const summary = $derived(`${goalTitle[plan.goal]} · ${days}\u00a0days a week · ${splitTitle[plan.split]} · ${plan.sessionMinutes}\u00a0min · ${levelTitle[plan.experience]} · ${gymName}`);

  function finish() {
    const g = { ...withGymUnits($state.snapshot(gym), pounds), id: uuid(), name: gymName, increments: {} };
    app.createProfile($state.snapshot(plan), g, pounds, days);
  }
</script>

{#snippet option(title: string, detail: string, selected: boolean, onclick: () => void, Icon?: typeof Zap)}
  <button class="card option" class:selected role="radio" aria-checked={selected} {onclick}>
    {#if Icon}<span class="ico"><Icon size={22} /></span>{/if}
    <span class="grow" style="text-align:left"><span class="bold">{title}</span><br /><span class="sub muted">{detail}</span></span>
    {#if selected}<CircleCheck size={24} color="var(--accent)" aria-hidden="true" />{:else}<Circle size={24} color="var(--muted)" aria-hidden="true" />{/if}
  </button>
{/snippet}

{#snippet pageTitle(title: string, subtitle: string)}
  <div class="stack" style="--gap:8px;margin:4px 0 8px">
    <h1 class="display" style="font-size:2.2rem;line-height:1">{title}</h1>
    <p class="muted">{subtitle}</p>
  </div>
{/snippet}

{#if installFirst}
<div class="onboarding">
  <div class="dots"><span class="brand eyebrow" aria-hidden="true">Forge</span></div>
  <div class="body stack" style="--gap:18px">
    <span class="install-ico" aria-hidden="true"><Download size={26} /></span>
    {#if separateAppData}
      {@render pageTitle('Add Forge to your Home Screen', 'Do this first, then set up in the app. It opens full screen, works offline at the gym, and keeps your workouts safe.')}
    {:else}
      {@render pageTitle('Install Forge', 'It opens full screen from your home screen and works offline at the gym.')}
    {/if}
    <div class="card"><InstallSteps /></div>
    {#if separateAppData}
      <p class="caption muted">{browser} and the Home Screen app keep separate data, and iOS can clear a browser tab's data after 7 days without a visit. Setting up here means doing it again in the app.</p>
    {:else}
      <p class="caption muted">Your setup and workouts carry over to the installed app, so you can also set up here and install later.</p>
    {/if}
  </div>
  <footer class="row" style="justify-content:center">
    <button class="link continue" onclick={() => (installFirst = false)}>{separateAppData ? `Continue in ${browser} anyway` : `Continue in ${browser}`}</button>
  </footer>
</div>
{:else}
<div class="onboarding">
  <div class="dots">
    <span class="brand eyebrow" aria-hidden="true">Forge</span>
    <span class="sr-only">Step {page + 1} of {PAGES.length}</span>
    {#each PAGES as _, i (i)}<span class="dot" class:on={i <= page} class:now={i === page} aria-hidden="true"></span>{/each}
    {#if page < 4}<button class="skip muted" onclick={() => (page = 4)}>Skip</button>{/if}
  </div>

  <div class="body stack">
    {#if PAGES[page] === 'goal'}
      {@render pageTitle("What's your goal?", 'Forge builds every workout around it. You can change this anytime in You.')}
      <div class="stack" role="radiogroup" aria-label="Goal">
        {#each GOALS as g (g)}{@render option(goalTitle[g], goalBlurb[g], plan.goal === g, () => (plan.goal = g))}{/each}
      </div>
    {:else if PAGES[page] === 'schedule'}
      {@render pageTitle('Your schedule', 'How often and how long you can train.')}
      <div class="card stack">
        <div class="bold">Days per week</div>
        <div class="row" style="--gap:8px" role="radiogroup" aria-label="Days per week">
          {#each [2, 3, 4, 5, 6] as n (n)}
            <button class="day" class:on={days === n} role="radio" aria-checked={days === n} aria-label="{n} days"
              onclick={() => { days = n; plan.split = recommendedSplit(n); }}>{n}</button>
          {/each}
        </div>
      </div>
      <div class="card stack">
        <div class="bold">Split</div>
        <p class="sub muted">We recommend {splitTitle[recommendedSplit(days)]} for {days} days a week.</p>
        <div class="row wrap" style="--gap:8px" role="radiogroup" aria-label="Split">
          {#each SPLITS as s (s)}<button class="chip" class:on={plan.split === s} role="radio" aria-checked={plan.split === s} onclick={() => (plan.split = s)}>{splitTitle[s]}</button>{/each}
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
      <div class="stack" role="radiogroup" aria-label="Experience">
        {#each LEVELS as l (l)}{@render option(levelTitle[l], levelBlurb[l], plan.experience === l, () => (plan.experience = l))}{/each}
      </div>
    {:else if PAGES[page] === 'gym'}
      {@render pageTitle('Where do you train?', 'Forge only suggests exercises you have the equipment for.')}
      <div class="stack" role="radiogroup" aria-label="Gym">
        {#each PRESETS as p, i (i)}{@render option(p.title, p.detail, preset === i, () => { preset = i; gym = p.gym(); }, p.icon)}{/each}
      </div>
      <div class="list">
        <label class="item"><span class="muted">Name</span><input type="text" bind:value={gym.name} placeholder={PRESETS[preset].gym().name} style="text-align:right;background:transparent" /></label>
        <button class="item" onclick={() => (editingGym = true)}>Customize equipment <span class="value mono">{gym.equipment.length}</span><ChevronRight size={16} color="var(--muted)" /></button>
      </div>
      {#if cantPull}
        <div class="card stack pull-warn" role="note" style="margin-top:20px;--gap:6px">
          <div class="row bold" style="--gap:8px"><TriangleAlert size={18} color="var(--recovering)" /> Nothing to pull with</div>
          <p class="sub muted">With this equipment there are no back exercises, so {plan.split === 'pushPullLegs' ? 'pull days will be nearly empty' : 'your back and biceps will get little work'}. A pull-up bar, resistance bands or dumbbells fix that.</p>
        </div>
      {/if}
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
      {#if !isStandalone() && separateAppData}
        <p class="caption" style="color:var(--recovering)">You're setting up in {browser}. Your workouts stay in this tab, separate from a Home Screen copy; back up now and then from You → Backup, Import & Export.</p>
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
{/if}

{#if editingGym}
  <Sheet title="Equipment" onclose={() => (editingGym = false)}>
    {#snippet leading()}<span></span>{/snippet}
    {#snippet trailing()}<button class="link bold" onclick={() => (editingGym = false)}>Done</button>{/snippet}
    {#each EQUIPMENT_GROUPS as group (group.title)}
      <div class="section-title">{group.title}</div>
      <div class="list">
        {#each group.items as eq (eq)}
          <Toggle label={equipmentTitle[eq]} checked={gym.equipment.includes(eq)}
            onchange={(on) => (gym.equipment = EQUIPMENT.filter((x) => (x === eq ? on : gym.equipment.includes(x))))} />
        {/each}
      </div>
      {#if group.foot}<p class="caption muted">{group.foot}</p>{/if}
    {/each}
  </Sheet>
{/if}

<style>
  .section-title { font-size: 0.8rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.03em; margin: 14px 0 6px; }
  .onboarding { min-height: 100dvh; display: flex; flex-direction: column; max-width: 620px; margin: 0 auto; padding: calc(var(--safe-top) + 8px) 20px calc(var(--safe-bottom) + 12px);
    position: relative; }
  .dots { display: flex; justify-content: center; align-items: center; gap: 6px; padding: 12px 0 18px; position: relative; min-height: 48px; }
  /* Plain class selectors, so the on/now states below win (a :not() chain here used to outrank them and hide progress). */
  .dot { width: 6px; height: 6px; border-radius: 3px; background: var(--surface-3); transition: width 0.35s var(--ease), background 0.3s; }
  .dot.on { background: var(--ember-2); }
  .dot.now { width: 24px; background: var(--ember-gradient); box-shadow: 0 0 10px var(--ember-glow); }
  .brand { position: absolute; left: 0; color: var(--ember-2) !important; letter-spacing: 0.3em; }
  .skip { position: absolute; right: 0; min-height: 44px; font-weight: 600; }
  .body { flex: 1; padding-bottom: 24px; animation: screen-in 0.35s var(--ease); }
  .option { display: flex; align-items: center; gap: 14px; width: 100%; transition: border-color 0.25s, background 0.25s; }
  .option.selected { border-color: rgba(255, 106, 46, 0.6); background: radial-gradient(80% 120% at 0% 0%, rgba(255, 90, 31, 0.16), transparent 60%), var(--surface); }
  .ico { width: 44px; height: 44px; border-radius: 14px; display: grid; place-items: center; background: var(--surface-2); color: var(--ember-2); flex: none; }
  .selected .ico { background: var(--ember-gradient); color: var(--on-ember); box-shadow: 0 8px 18px -6px var(--ember-glow); }
  .day { flex: 1; min-height: 52px; border-radius: 16px; background: var(--surface-2); border: 1px solid var(--hairline);
    font-family: var(--font-display); font-stretch: 125%; font-weight: 800; font-size: 1.3rem; }
  .day.on { background: var(--ember-gradient); border-color: transparent; color: var(--on-ember); box-shadow: 0 10px 22px -8px var(--ember-glow); }
  .install-ico { width: 56px; height: 56px; border-radius: 18px; display: grid; place-items: center; background: var(--ember-gradient); color: var(--on-ember); }
  .continue { min-height: 48px; padding: 0 16px; }
  footer { position: sticky; bottom: 0; padding: 12px 0 calc(var(--safe-bottom) + 12px); margin-bottom: calc(-1 * (var(--safe-bottom) + 12px));
    background: linear-gradient(to bottom, transparent, var(--bg) 35%); }
  .back { width: 56px; height: 56px; border-radius: 50%; background: var(--surface-2); border: 1px solid var(--hairline); display: grid; place-items: center; }
  .go { white-space: nowrap; display: inline-flex; align-items: center; gap: 8px; padding: 17px 28px; border-radius: 999px; background: var(--ember-gradient);
    color: var(--on-ember); font-weight: 700; font-size: 1.05rem; box-shadow: 0 16px 36px -10px var(--ember-glow), inset 0 1px 0 rgba(255, 255, 255, 0.3); }
</style>
