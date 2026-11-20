# Forge bug hunt: PRs #17–#20 and the batch 2/3 fixes

I tested origin/main at 7bc04bc in a scratch worktree. All 409 existing tests pass. The throwaway probes were in `web/src/hunt/*.test.ts` inside the worktree, which has since been removed. No project files were changed.

Severity counts: data loss 1 · crash 0 · wrong advice 8 · cosmetic 7

---

## Wrong advice

### N1. Progression gets stuck forever when a gym's step is finer than its plates can make (confirmed)
- **Steps:**
  1. Set up a kg gym with plates 20/10/5/2.5 and a Barbell step of 2.5 kg. You get this step by tapping "−" in Settings → Weight Steps, or by keeping an override from before PR #17.
  2. Log a bench press at 100 × 12 twice.
  3. Generate a workout.
- **Expected:** 105 kg. The smallest jump these plates allow is 5 kg.
- **Actual:** 100 kg × 6 reps, with the reason "Hit the top of the range on every set, adding weight". The planner rounds 100 + 2.5 = 102.5 to the nearest loadable weight. 102.5 is a tie between 100 and 105, and `nearestLoadable` breaks ties toward the lighter one, so the result is 100 again.
  - The reps then reset to the bottom of the range, so the user climbs 6→12 at 100 kg over and over.
  - The same thing happens in lb with a 2.5 lb step and 2.5 lb plates (135 stays 135).
  - It also happens for any step of 2 kg or less with that plate set.
  - Lower-body barbell lifts escape it, because their step is doubled.
- **Cause:**
  - `Planner.round(lastLoad + step)` in planner.ts has no guard against getting the same weight back.
  - The program path has one: `nextLoad` in progression.ts tries 2–4 grid steps.
  - Settings lets you set a step below 2 × the smallest plate, shows no warning, and has no way back to the plate-based default.
- **Severity:** wrong advice (high)

### N2. The default step and the double rounding skip weights the plates can make (confirmed)
- **Steps:**
  1. Set up a kg gym with plates 25/20/15/10 and no small plates.
  2. Call `gymRound` on 50 and on 70.
- **Expected:** 50 (bar + 15 a side) and 70 (bar + 25 a side).
- **Actual:**
  - 50 → 60 and 70 → 80.
  - `gymIncrement` = 2 × 10 = 20 kg, so the progression step is 20 kg, or 40 kg for squats.
  - A realistic lb set, 45/35/25/10 with no 5s, gives 95 → 105 and 115 → 125, and a 20 lb bench step.
- **Cause:**
  - The default "2 × smallest plate" isn't the smallest jump when plate sizes differ by less than the smallest plate (15 − 10 = 5 a side).
  - `gymRound` first rounds to that grid with `roundLoad`, then snaps to the plates, so a loadable weight between grid points can't be chosen.
  - The ExercisePage weight stepper uses the same step.
- **Severity:** wrong advice

### N3. At the limit of the plates you own, the advice still says "adding weight" (confirmed)
- **Steps:**
  1. Set up plates 20 × 2 pairs, 5 × 1 and 2.5 × 1. The heaviest bench you can load is 115.
  2. Log a bench press at the top of its range at 115, and separately at 117.5 (logged at another gym).
- **Expected:** Say the load is maxed out and suggest more reps or sets instead.
- **Actual:**
  - The generator gives 115 → 115 and 117.5 → 115 (lighter), both with the reason "Hit the top of the range on every set, adding weight".
  - The program's `nextLoad` returns 115 for both.
  - The program's reason text would then read "+0 kg", or "+-2.5 kg" for the 117.5 case. That text is suspected from the code (`next - lastLoad`).
- **Severity:** wrong advice

### N4. A dip belt and other "plates"-kind loads are rounded as if plates went on in pairs (confirmed)
- **Steps:** At a gym with plates 20/10 listed, call `gymRound` on weighted dips at 10 and at 30.
- **Expected:** 10 and 30. A belt hangs single plates.
- **Actual:**
  - 10 → 20 and 30 → 40.
  - The lightest weighted dip is 2 × the smallest plate. The fuzz found a gym where the deload dip was 30 kg after a last session of 11.9 kg.
  - The `'plates'` kind is in `PLATE_LOADED`, so `gymIncrement` and `nearestLoadable` treat it as two-sided.
  - The same applies to custom loaded lifts with no equipment, which `loadKind` treats as `'plates'`.
  - Hack squats are correctly two-sided.
- **Severity:** wrong advice

### N5. Deleting a block's first workout, or importing older history, moves the block start and orphans its check-ins (confirmed)
- **Steps:**
  1. Train every 2 days from day 0.
  2. Answer the week 5 check-in all-good, so the block is extended. On day 37 you're in week 6 of 7 and the week 6 check-in is due.
  3. Delete the day-0 workout.
- **Expected:** The block keeps its extension and the check-in stays answered.
- **Actual:**
  - `startedAt` moves to day 2. The answer is keyed by the old start, so it no longer applies.
  - Today flips to "week 6 of 6, deload" and the check-in disappears.
  - Importing one older workout 10 days before day 0 shifts things further: the user lands in block 2, week 1.
  - The old answers stay in `profile.blockCheckIns` as orphans.
- **Suspected, same cause:** Travelling across time zones changes `dayStart`, so every block start and check-in key changes too.
- **Severity:** wrong advice

### N6. After a program deload, the generator progresses from the deload loads (confirmed)
- **Steps:**
  1. Log a bench press at 100 × 8 twice.
  2. Log a program week 8 deload day with bench at 60 × 6 (`program.isDeload: true`).
  3. Use the generator the next day.
- **Expected:** About 100 kg. Deload sessions aren't a basis for progression.
- **Actual:** 60 kg, with the reason "Same weight: aim for 7 reps". `Planner.wasDeload` only knows the generator's own blocks and ignores `record.program.isDeload`.
- **Suspected, the reverse:** progression.ts only skips program deloads, so a generator deload-week session could become the program's `lastPast`.
- **Severity:** wrong advice

### N7. With sparse, pair-limited plates, a deload can come out no lighter (confirmed, contrived)
- **Steps:** Set up plates 20 × 1 pair and 1.25 × 1 pair, then call `lighter(60)`.
- **Expected:** Something under 60.
- **Actual:** 60. Both candidates, 54 and 57.5, snap back up to 60, and nothing checks that the result is actually lighter.
- **Severity:** wrong advice (low)

### N8. The generator runs a block that includes the program's workouts (suspected)
- While a program runs, the generator's block walker and `fallingLifts` see every workout, program days included.
- On a "use the generator today" day, the user can see the generator's week 5 check-in next to the program's own check-in. Its answers then decide a block made mostly of program sessions.
- This follows from the same cause as N6.
- **Severity:** wrong advice (low)

---

## Data loss

### N9. Switching kg/lb silently throws away custom plate lists, pair counts and bar weights (confirmed)
- **Steps:**
  1. Give a gym plates 20 × 3 pairs, 10 and 5, plus a 15 kg barbell.
  2. In You, switch to Pounds, then switch back.
- **Expected:** The inventory is kept, converted, or at least you're warned before it's dropped.
- **Actual:**
  - `withGymUnits` returns `plates: undefined` and `bars: undefined`, so the gym falls back to standard unlimited plates.
  - Only the exact standard or home presets with no pair counts carry over.
  - There's no confirmation and no undo. The code comment says this is deliberate, but the user loses settings they typed in.
- **Severity:** data loss (settings)

---

## Cosmetic

### N10. After an extended block deloads early on falling maxes, the deload card is titled "Extended: you're recovering well" (confirmed)
- **Steps:**
  1. Answer the week 5 check-in all-good.
  2. Let two lifts' e1RM fall during week 5.
- **Result:**
  - `blockStatus` gives `isDeload: true`, `earlyReason: "Estimated maxes dropped on 2 lifts"`, and a `checkInNote` that is still the extension note.
  - GeneratorToday shows `earlyReason && checkInNote ? checkInNote : 'Deload week'`, so the deload card's title is "Extended: you're recovering well".
- **Cause:** `enterWeek` doesn't clear `checkInNote` when the e1RM deload fires.

### N11. Starting a program resets the weekly-goal streak (confirmed)
- **Steps:**
  1. Train 3 workouts a week for 10 weeks with a goal of 3.
  2. Start a 5-day program.
- **Result:** The streak goes from 10 to 0. `app.weeklyGoal` now comes from the program, and `goalStreak` applies it to past weeks too. Finishing the program can make the streak jump back.

### N12. A new plain toast is dropped when three Undo toasts are showing (confirmed)
- **Steps:**
  1. Show three undoable toasts (remove, remove, delete gym).
  2. Then show "Deload starts now".
- **Result:** The new message never appears. The trimming loop removes the first plain toast, which is the one just added.

### N13. An imported workout dated today shows "<1 min" (suspected, from the code)
- The CSV import creates logs with `durationSeconds: 0`.
- LogDetail and the logs.ts summary skip a duration of 0, but GeneratorToday's TrainedCard calls `durationText(trainedToday.durationSeconds)` with no check. The card would say "Trained today: <1 min · N sets".

### N14. A plate count of 0, or a fractional count, is read back as "unlimited" (confirmed, low)
- `readPlates` reads `{weight: 20, pairs: 0}` and `pairs: 0.5` as having no `pairs`, which means as many as needed.
- The UI can't produce these values (it rejects 0), so only hand-edited backups are affected. Dropping that plate size would be the safer reading.

### N15. A Smith machine start of 0 can't be entered (suspected)
- Both `readAmount` and the decoder reject 0.
- Counterbalanced Smith machines ("starts at 0") therefore never get a plate breakdown on ExercisePage, because `plateSetup` needs `bars.smithMachine` to be set.

### N16. `prescribe` re-walks the whole block history on every call (measured)
- On 3,000 workouts with 6 lifts each:
  - `blockStatus` takes 24 ms.
  - `generate` takes 44 ms.
  - Each `Planner.prescribe` takes about 15 ms (20 calls take 311 ms). Swap and add menus call it once per candidate.
- It's fine on a laptop, but probably slow on an older phone.

---

## Fuzz re-run with plates and check-ins

- **Setup:** 1,500 seeded setups, each with:
  - random plate subsets from `PLATE_CHOICES`, with about 30% given pair limits of 1–4;
  - random barbell and Smith bars;
  - kg or lb;
  - up to 80 past sessions;
  - random check-in answers (including skips) on every due week.
- **Invariants checked:**
  - no throws;
  - fits the time budget;
  - uses only owned equipment;
  - weights are finite, positive and ≤ 1000;
  - every barbell, Smith and plates-kind weight can be made from the gym's plates;
  - "adding weight" means heavier;
  - a deload is never heavier than the last training load.
- **Result:**
  - No throws, no overtime, and no weight the plates can't make.
  - 3 "deload heavier" hits: one is N4 (dip belt), two are an exercise that's been away for over 14 days during a deload week, where the e1RM path has no lighter cap (minor).
  - The direct tests found N1 and N3; the fuzz misses them because its random plates are mostly unlimited.
- **deloadDates vs blockStatus:** On 60 random irregular histories with check-ins, they agreed for every record (0 mismatches).
- **Backups:** Plates, pair counts, bars, `blockCheckIns` (including skipped answers) and `weeklyGoal` all survive a `readBackup` round trip unchanged.

## Checked and found no problem

- The plate solver with no plates, a bar heavier than the target, and odd plate sizes.
- `readBlockCheckIns` bounds.
- Week 7: no extension past 7, and the sheet text reads correctly.
- Check-ins aren't offered during a deload.
- The deload-after-training rule matches between the sheet and the engine.
- `planBasis` includes plates, bars and check-ins.
- `repsLeftText`.
- The clock re-arming at midnight.
- The overlay stack.
- The "Check the Reps" order: the reps check comes first, and "log anyway" skips the weight check. That's acceptable.
- CSV number and date parsing.
