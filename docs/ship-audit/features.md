# Forge feature-gap audit (2026-11-19)

Scope: Forge web app (`web/src`) compared with Hevy, Strong, Fitbod, Boostcamp, JEFIT and RP Hypertrophy, before a small group of friends gets it. Accounts, sync, the friends feed, sharing and challenges are already planned (docs/full-build-plan.md, phases 2–5), so they are left out of the recommendations. I read the code only. I didn't run or change anything.

PWA limits assumed (iOS Home Screen web app):
- Available: IndexedDB, service worker and offline use, Screen Wake Lock, Web Audio while the app is in the foreground, Web Share with files, file input (camera or photos), and Web Push. Web Push needs a server to send it, and declarative push works from iOS 18.4.
- Not available: HealthKit, Live Activities, widgets, scheduled local notifications, and `navigator.vibrate` (it does nothing on iPhone).

---

## 1. Inventory: what Forge does today

**Today**
- Generator mode (GeneratorToday) builds a workout from:
  - your goal, level and split;
  - session length;
  - the active gym's specific equipment;
  - recovery, injuries and exercise preferences.
- Generator controls:
  - switching focus;
  - changing duration and gym;
  - "New Variation";
  - per-row swap, remove, and recommend more, less or never;
  - adding an exercise;
  - empty workout;
  - logging cardio or another activity;
  - starting or saving a saved workout.
- A 6-week block indicator, with a fatigue check-in that can extend a block to 7 weeks.
- Program mode (ProgramToday) runs one built-in program, "8-Week Push/Pull/Legs/Upper/Lower" (`pplul-8wk-home`). It has:
  - a weekly check-in;
  - skip-day, skip-exercise and drop-a-set-when-stalled options;
  - a flag on exercises the gym can't do, with a swap.
- Week strip with the weekly goal and goal streak.

**Logger** (ActiveWorkout and ExercisePage)
- One exercise per page, with swipe or arrows to move between them and a segment strip.
- Header chips show sets, effort, rest and notes.
- The active set has big weight and reps steppers.
- **Last time's matching set** shows inline on the active set and on every unlogged row.
- A **plate bar** (plates per side) uses the gym's plates and bars.
- Auto **warm-up sets** for compound lifts, collapsed by default.
- Per-set **RIR rating** ("reps left" chips, equivalent to RPE).
- Drop sets, sets to failure, AMRAP and per-side sets.
- PR trophies as you log.
- A typo check for implausible weight or reps.
- A **sticky note per exercise**.
- Reorder, link (superset, tri-set, circuit), add, remove and swap exercises.
- Save as a workout, or discard.
- The finish review handles unlogged sets.
- Rest timer:
  - a docked countdown with +15s and Skip;
  - a choice of sound (chime, bell, pulse, silent);
  - rest lengths come from the plan;
  - the screen wake lock is held during a workout.

**Progress**
- Goal streak with an 8-week bar chart, this week, and days since the last workout.
- Period report: workouts, time, sets and volume compared with the previous period.
- Recovery body map, which you can adjust by tapping a muscle.
- Calendar, linking to History.
- Weekly sets per muscle compared with the target.
- Bodyweight trend.
- Estimated 1RM line chart for 4 benchmark lifts (barbell squat, bench, deadlift, OHP).
- Recent PRs.

**Exercise detail**
- Your note and the how-to (steps, tips, a common mistake).
- Muscles, equipment and the recommend preference.
- PRs: estimated 1RM, heaviest, most reps and best session.
- An estimated 1RM chart and the full history list.
- Edit or delete for custom exercises.

**History**
- Search by exercise, filter by type (program, generated, imported), grouped by month.
- Log detail lets you edit the date and every set, delete, or save the workout as a template.

**You and Settings**
- Goal, experience, split, session length and weekly goal.
- Programs.
- Multiple gyms, each with:
  - specific equipment toggles;
  - plates and pair counts;
  - bar weights;
  - weight steps.
- Units.
- Workout style: variety, warm-up sets, supersets, warm-up drills, cool-down stretches and rest sound.
- Injuries.
- Saved workouts (start, rename, delete).
- My Exercises (custom exercises).
- Exercise preferences.

**Data**
- JSON backup export (share sheet) and restore, with a backup nudge.
- CSV import from Fitbod, Strong and Hevy, with matching or creating unrecognized exercises.
- Erase all data.

**Platform**
- Offline service worker with an "update ready" banner that never reloads mid-set.
- Multi-tab stale-copy protection.
- Swipe-back navigation.
- Good aria labelling throughout.

The catalog has 208 exercises, plus stretches and custom exercises.

---

## 2. Gaps vs popular apps, ranked by impact against effort

Legend:
- Effort: S = under a day, M = a few days, L = a week or more.
- Impact is for a handful of friends trying Forge.
- Before ship = worth doing before friends get it. Later = can wait.

| # | Gap | How the others do it | PWA-feasible? | Effort | Impact | When |
|---|-----|---------------------|---------------|--------|--------|------|
| 1 | **Exercise info and history inside the logger.** ExerciseDetail (how-to, PRs, 1RM chart, history) is unreachable from the logger, which is a full-screen modal with no link from the exercise name. | Hevy, Strong and JEFIT: tap the exercise name mid-workout for history, charts and how-to. | Yes. The data and the screen already exist; show them in a Sheet. | S | High | Before ship |
| 2 | **Editing saved workouts.** Saved workouts can only be started, renamed or deleted. You can't add, remove or reorder exercises, or change sets, reps or rest, without starting the workout and re-saving it. | Strong and Hevy routines are fully editable, and Boostcamp lets you edit a program day. | Yes. Reuse LogEditor or the logger's overview sheet. | M | High (friends who don't use the generator live in templates) | Before ship |
| 3 | **Rest timer control.** Only +15s and Skip. There's no −15s, no per-exercise rest you can edit, and no default rest for empty or manual workouts or added exercises. | Hevy has a default rest plus per-exercise rest, ±15s, and a live activity. Strong is similar. | Yes | S | High | Before ship |
| 4 | **Rest alert when backgrounded or locked.** The chime only plays while Forge is open; Settings says so, and the screen stays on instead. | Native apps use local notifications plus a Live Activity or lock-screen timer. | Partly, and only with a server: phase 2/3 could send a Web Push at `restEndsAt` (Home Screen apps, iOS 16.4+). It adds latency and needs signing in. No scheduled local notifications or Live Activities. | L | Med | Later (with sync). Before ship, just set expectations in onboarding. |
| 5 | **Making storage persistent.** `navigator.storage.persist()` is never called. All data is local, so eviction is the biggest risk to trust. | Not applicable, since native apps have durable storage. | Yes | S | High (data safety) | Before ship |
| 6 | **CSV export.** The Data screen is titled "Backup, Import & Export", but the only export is a Forge JSON backup. | Strong, Hevy and Fitbod export CSV, and Hevy's format is a de facto standard. | Yes. Write the Strong/Hevy column layout so the file round-trips with the existing importer. | S | Med-high (lets friends get their data out; the data lives only on their phone) | Before ship |
| 7 | **Logging a past workout.** Nothing lets you create a workout with a past date. The workaround is to start an empty workout, finish it, then edit the date. | Strong, Hevy and JEFIT all have "log past workout". | Yes. LogEditor already has a date picker. | S | Med | Before ship |
| 8 | **Workout-level notes and per-session notes.** Only one sticky note per exercise. There's no note on a workout and no note for an exercise in one session. | Hevy and Strong have both workout notes and exercise notes per workout. | Yes | S | Med | Before ship (cheap) |
| 9 | **Exercise library screen.** The library is only reachable as a picker sheet: search plus a muscle filter, with no equipment or "fits my gym" filter. You can't browse exercises to read how-tos or history outside a workout. | Every competitor has an Exercises tab with filters for muscle and equipment. | Yes. Reuse ExercisePicker and ExerciseDetail. | S–M | Med | Before ship if cheap, otherwise soon after |
| 10 | **Strength charts for any lift, and more metrics.** Progress charts only 4 barbell benchmarks, which a home or dumbbell friend may never do. Per-exercise charts show estimated 1RM only. | Hevy and Strong: any exercise; best set, heaviest weight, volume and reps; time ranges. | Yes. LineChart exists. | M | Med | Later (soon) |
| 11 | **Manual warm-ups.** Auto warm-ups cover compound lifts only. You can't add a warm-up set to an exercise in the logger, and there's no warm-up for isolation lifts or manual workouts. | Hevy has a warm-up calculator (Pro) with editable percentages, and Strong lets you mark sets as warm-up. | Yes. `planner.warmupSets` exists. | S | Med-low | Later |
| 12 | **Haptics.** `navigator.vibrate` is called on set log and rest end, but it does nothing on iPhone. | Native apps buzz on rest end. | Partly. The iOS 18 `<input type="checkbox" switch>` trick gives a tick on tap only, not on a timer. It's hacky. | S | Low | Later |
| 13 | **Exercise media.** ExerciseThumb is a glyph tile ("Stand-in for exercise photos"). How-tos are text only. | Hevy, Fitbod and JEFIT have a video or animation for every exercise. | Yes. A cheap option is a "Watch a demo" link to a YouTube search (S). Bundled media is L and raises licensing and size issues. | S (link) / L (media) | Med for beginners | Link before ship. Media later. |
| 14 | **Plate, 1RM and warm-up calculators as standalone tools.** The plate bar only appears on the active set, and the 1RM estimate is only shown. | Strong and Hevy have a plate calculator and Strong a 1RM calculator, both usable outside a set. | Yes. `plates.ts` and `strength.ts` exist. | S | Low-med | Later |
| 15 | **More programs.** There's only one program, and it's tuned for the owner's home gym. | Boostcamp has a large catalog (nSuns, GZCLP, PHUL, beginner LP), and RP has mesocycle templates. | Yes, it's content work. Each program takes M. A 3-day full-body beginner program is the most useful one to add for friends. | M each | Med (the generator covers most needs) | Later (one 3-day program before ship if friends are beginners) |
| 16 | **Body measurements.** Bodyweight only; no waist, arms and so on. | Hevy, Strong and JEFIT have measurements. | Yes. Mirror Bodyweight. | S–M | Low | Later |
| 17 | **Progress photos** | Hevy and JEFIT | Yes, with a file input, blobs in IndexedDB and local storage only. Photos bloat the JSON backup and sync. | M | Low | Later |
| 18 | **Share a workout summary or image** | Hevy and Strong share a workout card. | Yes. Render to canvas and use `navigator.share` with files, which already works for backups. | S–M | Low-med (the friends feed replaces it) | Later (phase 4) |
| 19 | **Finish screen PRs.** Only estimated 1RM PRs are celebrated; heaviest weight, rep and volume PRs are tracked but not shown. | Hevy shows every PR type. | Yes | S | Low-med | Later |
| 20 | **Offline indicator** | Not applicable, since native apps never need one. | Not needed until sync. The planned phase 3 sync status covers it. | — | Low | Planned |
| 21 | **Apple Health export** | Strong, Hevy and Fitbod write workouts and calories to Health. | **No.** A PWA has no HealthKit, and Shortcuts can't read PWA storage. Only the Swift app could do it. | — | Low-med | Won't do (note it for friends) |
| 22 | **Live Activity, lock-screen timer or widgets** | Hevy, Strong and Fitbod | **No** from a PWA | — | Med | Won't do |
| 23 | **Apple Watch** | Hevy, Strong, Fitbod and JEFIT | **No** | — | Low-med | Won't do |

Already present and on par (no gap):
- previous-set values inline;
- plate math in the logger;
- RPE, as RIR chips;
- notes per exercise;
- custom exercises, which the generator also uses;
- streaks;
- search and filter in the picker;
- reordering exercises mid-workout;
- PR tracking;
- import from the major apps.

---

## 3. Strengths to protect (better than the competition)

1. **Evidence-based generator**:
   - a weekly-volume budget per muscle, about 11 fractional sets per session;
   - a time model that fits the session length;
   - exercise quality tiers;
   - day slot templates;
   - accessory rotation.

   Fitbod is the only real peer, and it doesn't show set targets or RIR this clearly.
2. **Blocks, deloads and progression.** 6-week blocks derived from history, an RIR ramp, deloads, double progression, a fatigue check-in that extends a block to 7 weeks, and drop-a-set-when-stalled. That's RP-style mesocycles without RP's price.
3. **Equipment-aware gyms**:
   - 30 specific equipment items, plus resolution of what each exercise needs (high, low and adjustable cable; bench types);
   - multiple gyms;
   - per-gym plates, pair counts and bars;
   - weight steps, so every suggested weight can actually be loaded.

   This is better than every listed app.
4. **Per-set RIR feeding progression** and a typo guard that stops a mistaken weight from becoming a PR.
5. **Recovery model**: the body map, manual soreness override, weekly sets per muscle against a target, and cardio feeding muscle fatigue.
6. **Injury and preference filters** (recommend more, less or never), honoured by the generator.
7. **Generous import** from Fitbod, Strong and Hevy, with matching and creating unrecognized exercises. Friends can move over in one step.
8. **Logger polish**:
   - auto supersets, tri-sets and circuits;
   - drop sets and failure sets;
   - per-side sets;
   - a big, thumb-reachable Log button;
   - an update banner that never reloads mid-set;
   - wake lock;
   - accessible labels.
9. **Free, no paywall.** Hevy paywalls its warm-up calculator and Fitbod is subscription-only.
10. **Local-first and offline.**

When adding features, keep the one-exercise-per-page logger focused. Many competitor features would clutter it.

---

## 4. Rough edges in existing features

1. **ExerciseDetail is hard to reach.** It's only reachable from:
   - Today rows;
   - Log detail headers;
   - the 4 Progress benchmarks;
   - My Exercises.

   It isn't reachable from the logger, and there's no library screen. Its good content (how-to, PRs, charts) is mostly undiscovered. (Gaps #1 and #9.)
2. **"Backup, Import & Export"** promises an export the app doesn't have beyond JSON. The JSON backup is Forge-only and can't be opened in another app. (Gap #6.)
3. **Rest timer sound setting.** The setting is honest that it only plays in the foreground. But the rest feature as a whole is thin:
   - +15s only;
   - rest length can't be changed;
   - `navigator.vibrate` calls (ActiveWorkout.svelte:107, session.svelte.ts:674) do nothing on iPhone.

   Remove the vibrate calls or replace them with the switch-haptic trick.
4. **Saved workouts are buried and can't be edited.**
   - They're reachable only from Today's ⋯ menu and You → Fine-Tuning → Saved Workouts.
   - The empty state says to save from Today, the logger or history, but there's no "New saved workout" builder.
5. **Progress "Strength" card is tied to 4 barbell lifts.**
   - Friends who train with dumbbells or at home see a permanent empty state ("Log squat, bench, deadlift or overhead press…").
   - Better: chart the 4 lifts each user logs most, or let them pin lifts.
6. **Only one program**, named "…home" and tuned to the owner's equipment. The Programs list looks empty for something presented as a feature. Missing exercises are flagged and swappable, which helps.
7. **Warm-up Sets toggle** in Workout Style only affects generated and program compound lifts. Manual and template workouts and added exercises get none, and the logger gives no way to add one.
8. **Past workouts can't be created.** Editing the date of a finished workout is the only route. (Gap #7.)
9. **Finish summary** shows only estimated 1RM PRs. Heaviest weight, most reps and best session are computed in records.ts but not celebrated.
10. **Exercise thumbnails are placeholders** (glyph tiles). They're fine visually, but beginners get no picture of the movement.
11. **Exercise picker** filters by muscle only. There's no equipment or "fits my gym" filter when adding to an empty workout, so friends can add exercises their gym can't support. The swap picker does filter by gym.
12. **Storage durability.**
    - There's no `navigator.storage.persist()` call.
    - The backup relies on the user remembering to export.
    - Before friends arrive, consider a one-time "Back up to iCloud Drive" prompt after their first few workouts. BackupNudge exists; check that it fires early enough for new users.
13. **Generator controls are spread out.** The Your Plan icon, the ⋯ menu and the Switch, duration and gym chips are all on Today, and some settings are duplicated on You. Not broken, but a new user can't easily tell where "change my split" lives.

---

## 5. Recommended order

**Before shipping to friends** (about 1–2 weeks of S/M work):
1. Exercise info and history sheet from the logger (S, high).
2. Persistent-storage request, plus an earlier backup nudge for new users (S, high).
3. Rest control: −15s, editable rest per exercise in the session, and a default rest for manual workouts (S, high).
4. Saved-workout editor, plus "New saved workout" (M, high).
5. CSV export in Strong/Hevy format (S, med-high).
6. Log a past workout (S, med).
7. Workout notes, plus per-session exercise notes (S, med).
8. Exercise library screen with muscle, equipment and "fits my gym" filters (S–M, med).
9. Progress strength card: show the user's most-logged lifts instead of fixed barbell lifts (S, med).
10. A "Watch a demo" link on the how-to (S, med for beginners), and remove the dead `vibrate` calls.

**Later** (after phase 2/3, or once friends give feedback):
- any-exercise charts and metrics;
- manual warm-ups and a standalone calculator;
- a 3-day beginner program;
- body measurements;
- PR types on the finish screen;
- share card (folds into phase 4);
- rest-end Web Push (needs the server);
- progress photos.

**Won't do as a PWA:** Apple Health, Live Activities, widgets, Apple Watch, true background or locked-screen rest alerts without a server. Tell friends this up front, since some will expect it from Hevy or Strong.
