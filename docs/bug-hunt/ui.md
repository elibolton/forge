# Forge UI bug hunt: screens, components, state wiring

Paths are relative to `web/src`. "Keyed each crash" means: Svelte 5.58 `each.js` throws `each_key_duplicate` **in production as well as in dev** whenever a keyed `{#each}` sees two equal keys (`if (length > keys.size) e.each_key_duplicate(...)`, and errors.js throws in both branches). The throw is caught by the `<svelte:boundary>` in App.svelte, which replaces the **whole app** (tabs included) with "Something went wrong" and offers only Reload.

---

## 1. Adding an exercise that's already in Today's generated workout crashes the app, and it stays crashed until midnight
- **Severity:** crash-or-stuck
- **Status:** CONFIRMED (code trace)
- **Where:** screens/GeneratorToday.svelte:286 (picker list), :92 `add()`, :254 `{#each workout.exercises as p, i (p.exercise.id)}`
- **What happens:** The Add Exercise picker lists `Catalog.all.filter(planner.isEligible)` and includes exercises already in today's plan. `add()` pushes a second PlannedExercise with the same `exercise.id`, and `app.set('todayPlan', …)` saves it to IndexedDB. The keyed each then throws and the boundary shows the error screen. After a reload Today is the default tab, and `isTodayPlanCurrent` keeps the saved plan (same day, same log count), so it crashes again on every launch until the day changes. No UI path out exists, because the tab bar is inside the failed boundary.
- **Should:** Either leave out exercises already in the plan, or key the list by something unique.
- **Repro:** Today → "Add an exercise" → tap the exercise shown as card #1 → error screen → Reload → error screen again.
- **Fix:** Pass `exercises={Catalog.all.filter(e => planner.isEligible(e) && !today.workout.exercises.some(x => x.exercise.id === e.id))}`. Separately, make the `#each` key unique (for example the index, or a per-item uuid).

## 2. A logged workout containing the same exercise twice permanently crashes Progress (for the big 4 lifts) and that exercise's detail page
- **Severity:** crash-or-stuck
- **Status:** CONFIRMED (code trace)
- **Where:**
  - components/LineChart.svelte:45 `{#each s.points as p (p.x)}`. Points come from `app.derivedHistory.sessions`, which get one entry per logged exercise, so two entries in one log share `x = log.date`.
  - screens/Progress.svelte:44-50 (benchmark series) and :152 (`pr.logID + pr.exerciseID` can repeat)
  - screens/ExerciseDetail.svelte:29/106
  - components/FinishSummary.svelte:22 `(r.exercise.id)`, because `newRecords` (lib/finishWorkout.ts:48) emits one record per logged exercise
- **Ways to get a duplicate:**
  - ActiveWorkout "Add exercise" (screens/ActiveWorkout.svelte:285) doesn't exclude exercises already in the session.
  - LogEditor "Add Exercise" (components/LogEditor.svelte:140) offers all of `Catalog.all`.
  - ProgramToday swap (screens/ProgramToday.svelte:253) calls `alternatives()` with no exclude set, so slot B can be swapped to slot A's lift.
- **What happens:**
  - Finishing such a workout with a PR on both copies crashes on FinishSummary. The log is saved; Reload recovers.
  - From then on, opening Progress crashes the whole app whenever the lift is one of bb-squat/bench/deadlift/ohp.
  - Opening that exercise's detail page always crashes.
  - The only fix is to find the log in History and remove the duplicate.
- **Repro:** Start any workout with Barbell Bench Press → ⋯ → Add exercise → Barbell Bench Press → log a weighted set on both → Finish → open the Progress tab.
- **Fix:** Key LineChart points by index, or merge same-x points (keep the max y). Key FinishSummary and recent PRs by index. Optionally have `newRecords` and `prTimeline` merge per exercise per log.

## 3. "Empty Workout" / "Start a Saved Workout" silently throws away the workout in progress
- **Severity:** data-loss
- **Status:** CONFIRMED (code trace)
- **Where:**
  - screens/GeneratorToday.svelte:131,133 and screens/ProgramToday.svelte:127,129 (menu items)
  - components/TemplatePicker.svelte:17-21 (also reachable from You → Saved Workouts)
  - lib/session.svelte.ts:207-227: `begin()` overwrites `this.state` with no check
- **What happens:** The Start button is hidden while `session.isActive`, but the ⋯ menu items are not. With a workout minimised to the MiniBar, tapping Empty Workout (or any saved workout) replaces the session and persists it. Every logged set is gone, with no confirm and no Undo.
- **Should:** Hide or disable these items while a session is active, or confirm first and offer Undo (as `discard()` does).
- **Repro:** Start workout → log 3 sets → minimise → Today ⋯ → Empty Workout → the old sets are gone.
- **Fix:** Guard in `session.begin` (refuse when `this.state` has done sets unless forced). In the UI, filter these items out when `session.isActive`.

## 4. Starting or restarting a program wipes the current program's progress with no Undo
- **Severity:** data-loss
- **Status:** CONFIRMED (code trace)
- **Where:** screens/Programs.svelte:24-28 (`start`), :86 (Start Again), :101-102
- **What happens:** On another program's page, "Start Program" / "Start at Week…" replaces `programProgress` (week, completed days, setAdjustments, rangeExtensions, check-ins) immediately. The toast has no undo. The only warning is a small footer line. `end()` in the same file does offer Undo.
- **Fix:** Snapshot `current` and pass `() => app.setProgramProgress(before)` as the toast's undo, or `confirm()` when `current && !current.isFinished`.

## 5. Deleting a custom exercise that's in the running workout or a saved workout loses its identity
- **Severity:** data-loss
- **Status:** CONFIRMED (code trace)
- **Where:** lib/customExercises.ts:32-56, called from screens/Settings.svelte:190 and screens/ExerciseDetail.svelte:37
- **What happens:** "Uses" counts only finished logs. If the exercise is in the active session (added mid-workout) or in a saved template, it is hard-deleted. The session keeps going. On Finish the log references an id that `Catalog.exercise` turns into a placeholder (name rebuilt from the slug, no muscles, no equipment). The real name, muscles and starting 1RM are lost for good once the 7-second Undo expires. Saved templates show the placeholder too.
- **Repro:** Start workout → Add exercise → Create "Landmine Press" → minimise → You → My Exercises → delete it → finish the workout → History shows "Custom Landmine Press Ab12cd".
- **Fix:** Count `session.state.exercises` and `app.templates` as uses (hide instead of delete).

## 6. Weigh-ins outside 20–400 kg (including 0) save, show, then vanish on the next launch
- **Severity:** data-loss
- **Status:** CONFIRMED (code trace)
- **Where:** components/Bodyweight.svelte:26-31,83 vs lib/bodyweight.ts:9
- **What happens:** ValueStepper allows 0 (and anything up to 1e15). `save()` doesn't validate, so "0 kg" or a typo like "8" or "800" is written and drawn in the chart. `readBodyweight` drops anything outside 20 < kg < 400, so the entry disappears silently after a reload or backup restore.
- **Fix:** Disable Save unless `u.kg(value)` is in (20, 400). Optionally clamp in the stepper with min/max props.

## 7. LogEditor always thinks there are unsaved changes (date loses its seconds)
- **Severity:** cosmetic (a nag; also rewrites the log)
- **Status:** CONFIRMED (code trace)
- **Where:** components/LogEditor.svelte:22-23,32-33
- **What happens:** `toLocalInput` truncates to minutes, so `newDate !== original.date` is true for every real log (they carry seconds and ms). As a result:
  - Opening Edit and tapping Cancel, swiping down, or pressing Escape always asks "Discard your changes to this workout?"
  - Tapping Save with no edits rewrites the log with a truncated date and shows "Workout updated".
- **Fix:** Compare at minute precision (`Math.floor(original.date/60000) !== Math.floor(newDate/60000)`), and keep `original.date` when the minute is unchanged.

## 8. Every weight is displayed rounded to 0.5, so kg bodyweight (0.1 steps) and typed weights show different numbers from what's stored
- **Severity:** cosmetic (wrong numbers on screen)
- **Status:** CONFIRMED (test: `display(80.3)=80.5`, `display(21.25)=21.5`, `format(0.2)="0 kg"`)
- **Where:** lib/units.ts:9-12. Used by Bodyweight.svelte:22,54,58,70,19, the ValueStepper weight value in ExercisePage.svelte:206 and LogEditor.svelte:97, Progress.svelte:161, Report.svelte:18.
- **What happens:**
  - Bodyweight stepper steps by 0.1 kg. Saving 80.3 shows "80.5 kg" in the card, list and chart, and the next weigh-in prefills 80.5.
  - In the logger and LogEditor, typing 82.3 stores 82.3 kg but displays 82.5 after blur.
  - Progress "+0 kg" appears for a real PR under 0.25 kg; Report shows "0 kg vs last week".
- **Fix:** Give `display()` a precision argument: use 0.1 for bodyweight, and for typed loads round to the unit's real step. Show '<0.5' or hide sub-step deltas.

## 9. Gym "Weight Steps" can't be set for most load types; an EZ-bar-only gym shows a "Barbell" step that does nothing
- **Severity:** wrong-advice
- **Status:** CONFIRMED (code trace)
- **Where:** screens/Settings.svelte:34-46 vs engine/models.ts:134-141 (LOAD_ORDER)
- **What happens:** `loadKinds` only offers barbell, dumbbell, kettlebell, plates, cable, latPulldown and machine. The exercises themselves use the kinds ezBar, trapBar, smithMachine, legPress, legCurl, legExtension, chestPressMachine and shoulderPressMachine, whose steps can never be changed. ezBar and trapBar are folded into the 'barbell' row, but `gymIncrement` looks up `increments.ezBar` / `increments.trapBar`. So a gym with only an EZ bar shows "Barbell: 2.5 kg steps", and changing it has no effect on EZ-bar exercises. Users with 10 lb leg-press or chest-press stacks keep getting impossible suggestions.
- **Fix:** Build the list from LOAD_ORDER: every LoadKind that some owned equipment maps to. Write `increments[kind]` per kind.

## 10. Swipe-back flashes the old screen back before it pops
- **Severity:** cosmetic
- **Status:** CONFIRMED (code trace)
- **Where:** App.svelte:92 plus lib/nav.svelte.ts:57-60
- **What happens:** After the swipe animation, `nav.pop()` calls `history.back()`, which is async (the screen only changes on popstate). The same tick resets `transform`/`opacity` to '', so the departing screen snaps back to full view for a frame or more before the popstate swap.
- **Fix:** Reset the styles only in the next screen's mount (it's keyed anyway), or call `popNow` directly and fix up history afterwards.

## 11. Nested sheets unlock page scroll while the outer sheet is still open
- **Severity:** cosmetic
- **Status:** CONFIRMED (code trace)
- **Where:** components/Sheet.svelte:75-78
- **What happens:** Each Sheet sets `body.style.overflow='hidden'` and clears it on destroy. Closing an inner sheet clears the lock while the outer sheet is still showing, so the page behind scrolls (rubber-banding on iOS). Nestings: ExercisePicker → CustomExerciseEditor, LogEditor → ExercisePicker → editor, Data → picker.
- **Fix:** Use a module-level open-sheet counter and only unlock at 0.

## 12. Focus isn't returned after menus and sheets close
- **Severity:** cosmetic (accessibility)
- **Status:** CONFIRMED (code trace)
- **Where:** components/ActionMenu.svelte:31-34 and Sheet.svelte:71,79
- **What happens:**
  - ActionMenu never refocuses its trigger button when closed.
  - When a menu item opens a sheet (Swap, Add Exercise, Save, Saved Workouts, Log Cardio), the focused menu button has already been removed, so Sheet records `document.activeElement` = body and "restores" focus to nothing.
  - Escape is handled by every open Sheet and ActionMenu at once, so one Escape closes a menu and the sheet under it (LogEditor then raises its discard prompt).
- **Fix:** ActionMenu keeps a ref to its trigger and focuses it on close (or passes it to the action). Escape handlers should `stopImmediatePropagation` for the top-most overlay only.

## 13. ActionMenu checked items aren't announced as selected
- **Severity:** cosmetic (accessibility)
- **Status:** CONFIRMED
- **Where:** components/ActionMenu.svelte:46-48
- **What happens:** Items with `checked` (Switch focus, Duration, Gym) are `role="menuitem"` with only a visual Check icon. VoiceOver doesn't say which is selected.
- **Fix:** Use `role="menuitemradio"` with `aria-checked={!!item.checked}` when `checked !== undefined`.

## 14. Single-choice controls marked with aria-pressed or nothing
- **Severity:** cosmetic (accessibility)
- **Status:** CONFIRMED
- **Where:**
  - Onboarding.svelte:37 (goal/level/gym options use aria-pressed toggle semantics for a radio choice)
  - History.svelte:56 (filter chips)
  - Data.svelte:98-99 ("Weights in file" segmented has no role or state at all)
  - Onboarding.svelte:52 (aria-label on a role-less div is ignored)
- **Fix:** Use `role="radiogroup"` / `role="radio"` with `aria-checked`, as the Units segmented already does.

## 15. No upper bound on typed numbers (weights, reps, minutes)
- **Severity:** wrong-advice
- **Status:** SUSPECTED (the missing clamp is confirmed; the downstream effect on prescriptions is suspected)
- **Where:** components/ValueStepper.svelte:20-26, ActivitySheet.svelte:21,42
- **What happens:** A typo such as "1000" for 100 in the logger or LogEditor is accepted and saved. It becomes a PR (prTimeline, bestOneRM) and likely drives future e1RM-based prescriptions. In ActivitySheet, the date is `now - minutes`, so a typo of 6000 minutes logs a "Today" run four days back; even 90 minutes just after midnight lands on yesterday. Long values also overflow the dial: the font only shrinks to 2.1rem.
- **Fix:** Add `min`/`max` props to ValueStepper (weight ≤ 500 kg / 1100 lb, reps ≤ 100, minutes ≤ 600). For "Today" activities, clamp the start to today's midnight.

## 16. Typed value and saved value disagree in ValueStepper (negative, 0, decimals in reps)
- **Severity:** cosmetic
- **Status:** CONFIRMED
- **Where:** components/ValueStepper.svelte:20-26
- **What happens:** The draft keeps the raw text while `onchange` gets the clamped or rounded value until blur. Examples: ActivitySheet "2" saves 5 while showing "2"; reps "8.5" saves 9 while showing "8.5"; a pasted "-5" saves 0 while showing "-5". Tapping Save or Log straight from the keyboard (the documented flow) commits a number the user never saw.
- **Fix:** After `onchange`, set `draft` to `String(committed)` when it differs from the parsed value, or validate and visually flag the field.

## 17. "Save workout" can save a template with no exercises, which then disappears
- **Severity:** cosmetic
- **Status:** CONFIRMED (code trace)
- **Where:** components/SaveTemplateSheet.svelte:14-18, lib/templates.ts:17-19, readTemplate:52
- **What happens:** Saving from a log or session where every exercise has 0 working sets (warm-ups only, or nothing done yet) produces `exercises: []`. Save is still enabled, "Saved …" is toasted, and on next launch `readTemplate` drops it.
- **Fix:** Disable Save when `preview.exercises.length === 0`.

## 18. Progress tab: Recent records "+0 kg" and Report "No data yet" for bodyweight-only training
- **Severity:** cosmetic
- **Status:** CONFIRMED (arithmetic)
- **Where:** Progress.svelte:161; Report.svelte:38
- **What happens:**
  - A real PR can be up to 0.25 kg over the previous best (0.5% of a 40 kg e1RM is 0.2 kg). `format` rounds that to "+0 kg".
  - If all of a week's workouts are bodyweight, the Volume tile says "No data yet" beside a non-zero Workouts tile.
- **Fix:** Show one decimal for PR deltas. Have the Volume tile say "No weighted sets" instead.

## 19. Titles disagree between Today and History/Calendar
- **Severity:** cosmetic
- **Status:** CONFIRMED
- **Where:** lib/logs.ts:17 vs lib/labels.ts:41-45
- **What happens:** `logTitle` gives "Upper Body Day", "Full Body Day" and "Recovered Muscles Day". Today's hero (`dayTitle`) says "Upper Body", "Full Body" and "Fresh Muscles". Saved-workout sessions (`focus: null`, session `title` = template name) and empty workouts are all titled "Workout" in History, and History's filter files them under "Generated" (History.svelte:16). The session `title` (for example "Week 2 · Pull") is never stored on the log.
- **Fix:** Use `dayTitle` in `logTitle`. Persist `state.title` on WorkoutLog and prefer it.

## 20. TrainedCard says "1 min" for workouts with no duration (imported)
- **Severity:** cosmetic
- **Status:** CONFIRMED
- **Where:** GeneratorToday.svelte:179 (`Math.max(1, floor(duration/60))`)
- **What happens:** `logSummary` deliberately hides the duration for imported workouts; this card doesn't.
- **Fix:** Omit the minutes part when `durationSeconds === 0`.

## 21. Exercise detail history hides added weight on bodyweight exercises
- **Severity:** cosmetic
- **Status:** CONFIRMED
- **Where:** ExerciseDetail.svelte:119
- **What happens:** For weighted pull-ups or dips (bodyweight exercises logged with weight > 0), the history rows show only reps. The PR tiles do show the weight.
- **Fix:** Use the SetLine rule: `x.weight > 0 ? format×reps : reps`.

## 22. Only one toast at a time: a second undoable action silently drops the first Undo
- **Severity:** data-loss (minor)
- **Status:** CONFIRMED
- **Where:** lib/toasts.svelte.ts:9-13
- **What happens:** For example, deleting two workouts within 7 s from History or the Calendar leaves only the second undoable. Also, the ActiveWorkout swipe-hint toast fires 900 ms after the logger opens and can replace a "Workout discarded / Undo" toast from a restore.
- **Fix:** Queue toasts, or commit the previous undo window into a stack.

## 23. Toasts and the save-error banner cover each other
- **Severity:** cosmetic
- **Status:** CONFIRMED
- **Where:** ToastHost (z 100, top), SaveErrorBanner (z 95, top), UpdateBanner (z 90, top)
- **What happens:** Tapping "Try Again" shows the toast "Still not saving" directly over the banner's Try Again and Export buttons for 3 s (the toast has pointer-events:auto). If an update is ready while a save error is showing, the UpdateBanner sits hidden underneath.
- **Fix:** Stack them (offset the toast below banners) or reuse a single top slot.

## 24. Deleted items left on another tab's stack render empty screens
- **Severity:** cosmetic
- **Status:** CONFIRMED (code trace)
- **Where:** LogDetail.svelte:29-53, Settings.svelte:49-53, ExerciseDetail.svelte:20 (placeholder exercise)
- **What happens:**
  - Open a workout on the Today tab, then delete it from the Progress tab's calendar and return to Today. The page shows "Workout" and nothing else.
  - The same happens for a gym deleted in You while its editor is open in another tab, showing just "Gym".
  - A deleted custom exercise's page still offers "Edit" and "Delete Exercise" for the placeholder, and "Delete" toasts "Deleted …".
- **Fix:** Show a "This workout was deleted" empty state with a Back button, or auto-pop on missing ids.

## 25. Backup nudge relies on counting logs, so deletions hide unsaved workouts
- **Severity:** data-loss (risk)
- **Status:** CONFIRMED (logic trace)
- **Where:** lib/backup.ts:61-69, BackupNudge.svelte:8
- **What happens:** `unsaved = logs.length - backupLogCount`. After a backup of 10 workouts, deleting 3 and logging 3 new gives `unsaved = 0`, so the nudge never shows although 3 workouts aren't backed up. The copy also reads "1 new workouts".
- **Fix:** Compare against the newest log date or ids at backup time (for example `max(date) > backupNewest`). Pluralise the copy.

## 26. "Later" on the update banner hides it until a different new version arrives
- **Severity:** cosmetic
- **Status:** SUSPECTED
- **Where:** lib/pwa.svelte.ts:14,26
- **What happens:** `onNeedRefresh` fires once per waiting worker. `registration.update()` on visibility won't re-fire it for the same waiting SW, so after "Later" there's no way to apply the update from the UI until the standalone app is fully killed.
- **Fix:** On `visibilitychange`, if `registration.waiting` exists, set `ready = true` again (maybe after a snooze period).

## 27. Saving a backup marks it done even when nothing was saved
- **Severity:** data-loss (risk)
- **Status:** SUSPECTED
- **Where:** lib/backup.ts:35-48; ProblemScreen.svelte:14-16
- **What happens:** If `navigator.share` rejects with anything other than AbortError (for example NotAllowedError when the user activation has lapsed), the code falls back to a blob `<a download>` click and returns true. In an iOS standalone PWA that fallback often does nothing visible. Even so, `lastBackupAt` and `backupLogCount` are recorded and the nudge goes away. ProblemScreen's raw export awaits IndexedDB before calling share, which makes the activation lapse more likely.
- **Fix:** Return false (and toast "Couldn't save") on non-Abort share errors in standalone mode. In ProblemScreen, read the data first and share from a second tap.

## 28. Onboarding small issues
- **Severity:** cosmetic
- **Status:** CONFIRMED
- **Where:** Onboarding.svelte:14,91,55,123
- **What happens:**
  - The "Home Gym" preset copy omits kettlebells, which `Gyms.home` includes.
  - Picking a preset silently discards a typed gym name and any custom equipment (`gym = p.gym()`).
  - "Skip" jumps to the last page, and Back from there goes to the gym page, not where you were.
- **Fix:** Update the copy. Keep `gym.name` when switching presets if it was edited.

## 29. Minor wording and pluralisation
- **Severity:** cosmetic
- **Status:** CONFIRMED
- **Where:** You.svelte:70 ("1 pieces of equipment"), TemplatePicker.svelte:50 ("1 exercises"), GeneratorToday.svelte:251, BackupNudge.svelte:17, MiniBar.svelte:19 ("Set 0 of 0" for an exercise with no working sets)

## 30. Dates computed once and never updated past midnight
- **Severity:** cosmetic
- **Status:** CONFIRMED
- **Where:** WeekStrip.svelte:9,16; WorkoutCalendar.svelte:37; ScreenHeader.svelte:6-9; GeneratorToday.svelte:37 and ProgramToday.svelte:40-41 (`Date.now()` inside `$derived` isn't reactive)
- **What happens:** With the app left open overnight (common for Home Screen apps), Today's week strip, the "trained today" card, rest-day detection and the header date stay on yesterday until something else re-renders. The visibilitychange handler only rebuilds the plan.
- **Fix:** Add a shared `now` store that ticks on visibilitychange and at midnight.

---

### Checked and found OK
- weeks.ts across year boundary and DST, tested in Europe/London: Monday-start is correct and `countInWeek` handles DST correctly.
- goalStreak can't loop forever because the goal is clamped 1–7.
- LineChart handles all-equal and single-point data without dividing by zero (ticks fall back to `[lo, lo+step]`).
- Comma decimal entry (`replace(',', '.')`) works.
- Static program data and exercise tips have no duplicate keys (tested).
- Every Equipment item is in EQUIPMENT_GROUPS and every Need has a title (tested).
- The Sheet portal and the edge-swipe don't interfere with each other.
