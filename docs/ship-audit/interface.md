# Forge interface audit (pre-friends launch)

**Audited:** https://elibolton.github.io/forge on 2026-11-19/20. I used the built-in browser at 375×812 in dark mode, starting from an empty origin (IndexedDB `forge` had no rows).

**Path walked:**
- Onboarding with every gym preset, plus equipment customization.
- Today (generator mode): Switch, duration, body map, the stale-workout banner, the "no work today" card and the week 5 block check-in.
- The logger: sets, effort ratings, a drop set, a superset, swap, add and remove exercise, the rest timer, minimize and discard.
- Finishing a workout, then History (the calendar), the workout detail and its edit.
- The exercise page and Progress.
- You: gyms, plates and bars, weight steps and injuries.
- Programs: start, then Program Today.
- Saved workouts, cardio and a weigh-in.
- Data: an invalid restore, and a CSV import with a manual match.

**Not exercised:**
- **Export Backup.** It triggers a file download.
- **A valid restore.** It goes through a native `confirm()`.
- **The program fatigue check-in and program rest day.** I couldn't reach them without faking dates.

**Caveat:** the browser pane was hidden for most of the run, so page transitions were throttled. I judged motion from the CSS instead:
- transitions run 150–350 ms with a good ease curve;
- `prefers-reduced-motion` is respected;
- nothing felt janky.

The bug-hunt items and the earlier polish passes are not repeated here.

---

## Tap counts

| Task | Taps | Notes |
|---|---|---|
| Start today's workout | 1 | "Start workout" on Today. |
| Log a typical set (prefilled weight/reps correct) | **2** | Log set, then a "reps left" chip. The rating is optional, so the true minimum is 1. |
| Log a set with one weight change | 3 | Uses the stepper. Typing a weight takes 4 taps plus the keyboard: tap the number, type, Log, rate. |
| Move to the next exercise | 1 | "Next · Seated Cable Row". Supersets auto-advance with 0 taps. |
| Finish a workout | **3** | Finish, then "Save Workout" (or "Save without them" / "I did them, log as planned"), then "Done". |
| Whole session (5 exercises × 3 sets) | ~38 | 1 start + 15×2 sets + 4 next + 3 finish. |

These counts are good. The friction in the logger is about what covers the screen between taps, not how many taps there are (see #1).

---

## Findings, ranked by impact

### HIGH

**1. Logger: after logging a set, three floating layers cover the controls for the next set**
- **Screen:** Active workout, right after "Log set N".
- **What's wrong:**
  - Three things stack over the bottom ~55% of the screen:
    - the "Log set N+1" pill floats mid-screen;
    - the "Reps left on set N" chip card sits under it;
    - the rest timer sits at the bottom.
  - The Log pill sits directly over the weight and reps steppers. In screenshots the −/+ buttons and the "lb/reps" labels are hidden. During a superset the same happens to the next exercise's target (the "20 lb / 10 reps" numbers were half-covered).
  - The Log pill is about 20 px above the 0–4+ rating chips.
- **Why it matters:**
  - The moment between sets is when people adjust the next set's weight, and they can't without first rating or closing the prompt.
  - A slightly high tap on a rating chip logs the next set instead, with no rest.
- **Suggested change:**
  - Keep "Log set" pinned at the very bottom.
  - Put the rating chips into the rest timer bar ("Rest 1:52 · Reps left? 0 1 2 3 4+"), or show them inline on the just-logged set row.
  - Never let a floating layer overlap the Now card's steppers. Add bottom padding equal to the overlay height.
- **Effort:** M. **Impact:** high.

**2. Onboarding: "Add to Home Screen" comes after setup, then tells the user to redo it**
- **Screen:** Onboarding step 5 ("You're all set").
- **What's wrong:** The user picks goal, schedule, experience, gym and units in Safari. Only then does the install card say "Each copy keeps its own data, so finish setup in the Home Screen app".
- **Why it matters:** Every friend opening the link in Safari does onboarding twice, or keeps using the Safari copy and later loses their data. It's the first impression.
- **Suggested change:** Check `navigator.standalone` / `display-mode: standalone` on first launch. If the page is in a browser tab, show the install screen *first* and make it the only step, with a small "Continue in browser anyway" link. Then run onboarding inside the installed app.
- **Effort:** S–M. **Impact:** high.

**3. Today: stacked status cards push the workout and Start button off-screen**
- **Screen:** Today (generator mode) once history exists.
- **What's wrong:**
  - With imported history, the top of Today showed, in order: the backup nudge ("Back up now / Later"), "Trained today", "Week 5 check-in" (Check in / Skip), then the hero. After check-in it showed the "Extended: you're recovering well" card.
  - "Start next workout" ended up under the tab bar.
  - Each card has its own look: a blue-tinted card with an icon tile, a green-tinted card with a filled circle, an orange-outlined card with a bare icon, and a plain card with a bare icon.
  - Three orange primary buttons were visible at once.
- **Why it matters:** Today's job is "what do I do now". New users see three competing calls to action and no workout.
- **Suggested change:**
  - Use one "notice" slot above the hero that shows only the most important message, in one shared card style with a single secondary button. Queue the rest.
  - Collapse "Trained today" into a line in the hero's eyebrow.
  - Keep the hero as the first full card.
- **Effort:** M. **Impact:** high.

**4. White text on the orange gradient fails contrast**
- **Screens:** Every primary button: Start workout, Log set, Next, Finish, Save, Done, Back up now and Check in.
- **What's wrong:**
  - The gradient runs `#ff4d1a → #ffa646`.
  - White on the light end is about 2.0:1. White on the dark end is about 3.3:1.
  - That's below WCAG AA (4.5:1) everywhere, and below 3:1 for large text on the right half of every pill.
- **Why it matters:** These are the most-tapped labels in the app, read in a bright gym, mid-set, often at arm's length.
- **Suggested change:** Use either:
  - a darker, flatter fill (for example `#e2470f → #f0641f`) with white text; or
  - near-black text (`#1a0a02`) on the current gradient, which is about 9:1.
- **Effort:** S. **Impact:** high.

**5. The stale-workout notice sits below Start and doesn't say what changed**
- **Screen:** Today, after changing Injuries (or plan settings).
- **What's wrong:**
  - "Your plan or recovery changed" with Update / Keep appears *under* the Start button.
  - The stale workout, still containing shoulder-loading exercises, stays one tap away above the notice.
  - The copy doesn't say which change triggered it.
- **Why it matters:** Someone who just flagged an injury can start the workout that ignores it.
- **Suggested change:**
  - If the user hasn't edited the workout, regenerate silently and show a short toast: "Updated for your shoulder".
  - Otherwise place the notice above the hero, name the change ("You added a shoulder limitation"), and disable or relabel Start until they choose.
- **Effort:** S–M. **Impact:** high.

**6. Reorder & group sheet: exercise names are crushed and overlapped**
- **Screen:** Logger → ⋯ → Reorder & group exercises.
- **What's wrong:**
  - The name column is about 70 px wide, so "Single-Arm Cable Reverse Fly" wraps to four lines.
  - The green "done" check is drawn on top of "Pulldown".
  - Up arrow, down arrow and a big red trash button take about 60% of the row.
- **Why it matters:** It looks broken, and it's where supersets are made, a feature friends will try.
- **Suggested change:**
  - Give the name the full row width.
  - Move the controls to a trailing drag handle (or a compact ⋯) and make delete swipe-to-delete or a menu item.
  - Put the done check next to the "4/4 sets" sub-line.
- **Effort:** M. **Impact:** high.

**7. History is hard to find and scan**
- **Screen:** Progress → Calendar.
- **What's wrong:**
  - Past workouts are only reachable by tapping individual calendar days, halfway down a long Progress page.
  - There's no reverse-chronological list.
  - The ⋯ on a history row offers only "Delete Workout": no Repeat, Save or Edit.
- **Why it matters:** "What did I do last Monday?" and "do that again" are core gym-app tasks. Right now they're a scavenger hunt.
- **Suggested change:**
  - Add a "History" list (rows of workout name, date, duration and sets) reached from a "See all" link on the calendar header and from a row on You.
  - In the row ⋯ menu, add "Repeat this workout" and "Save as workout".
- **Effort:** M. **Impact:** high/med.

### MEDIUM

**8. The Programs catalog has one program, and it's yours**
- **Screen:** You → Program.
- **What's wrong:**
  - The only entry is "8-Week Push/Pull/Legs/Upper/Lower: 5 days a week, hypertrophy, home gym. Long-length training, 10–20 weekly sets per muscle…".
  - Nothing shows whether it fits the user's days or equipment.
  - "Start Program" is a text row, not a button.
  - After starting, the page stays put with no feedback and no "Go to Today" link.
  - The program page header is left-aligned, unlike other headers.
- **Why it matters:** A friend with 3 days and a commercial gym sees one jargon-heavy program built for someone else.
- **Suggested change:** Either hide Programs for the friends release, or add 2–3 general templates (3-day full body, 4-day upper/lower). Also:
  - show "Fits your schedule" and equipment badges;
  - make Start a primary button;
  - after starting, return to Today with a toast.
- **Effort:** S (hide) / L (templates). **Impact:** med.

**9. Text truncated at 375 px**
- **Screens and what's cut:**
  - **Today** gym chip: "Home Gym (Bar…".
  - **Swap sheet** title: "Swap Single-Ar…".
  - **CSV match sheet:** "Match "Zottma…". You can't see the name you're matching.
  - **Program** header: "8-Week Push/Pull/Le…".
  - **Superset banner:** "then Single-A…" / "then back to …".
  - **History row:** wraps "3,500 / lb moved".
  - **Onboarding summary:** wraps "60 / min".
  - **Workout detail** date: wraps.
  - **You → Gyms:** "Training At" wraps to two lines.
- **Why it matters:** Cut-off names in pickers hide the information needed to choose.
- **Suggested change:**
  - Let sheet titles wrap to two lines, or move the long name into a subtitle.
  - Shorten the preset name to "Home (Barbell + Cables)".
  - Put the superset "next" on its own line.
  - Use `white-space: nowrap` on value+unit pairs.
- **Effort:** S. **Impact:** med.

**10. The same idea is called different things on different screens**
- **Effort words:** "Reps left" (logger), "REPS IN RESERVE" (Edit Workout set editor), "to failure" (logger) vs "0 left" (history detail), "Big lifts: 3 reps left" (Program Today).
- **Split names:** "Freshest Muscles" (onboarding and You) vs "Recovered Muscles" (Switch menu).
- **Internal jargon:** "Use Generator Today" (Program Today ⋯).
- **Goals:** "Powerlifting" appears in You but not in onboarding.
- **Day names:** "Pull Day" (logger, history) vs "Pull" (Trained-today card); "Full Body" vs "Pull Day".
- **Why it matters:** The polish pass removed jargon on most screens, but the leftovers now stand out, and new users wonder whether these are different things.
- **Suggested change:**
  - Use "reps left" and "to failure" everywhere.
  - Pick one name for the recovery-based split.
  - Rename the menu item "Use a generated workout today".
  - Either add Powerlifting to onboarding or hide it.
  - Pick "X Day" or "X" and use it everywhere.
- **Effort:** S. **Impact:** med.

**11. The same workout shows different durations, and imported workouts read as "None"**
- **Screens:** Today's "Trained today" card, the history row and the detail say **2 min**. The Progress "Report → Time" for the same single workout says **3 min**.
- **What's wrong:**
  - The durations disagree.
  - CSV-imported workouts have no duration, so Time says "None last week" even though there were 3 workouts last week.
- **Why it matters:** Numbers that disagree make people distrust every number.
- **Suggested change:**
  - Use one duration formatter.
  - Skip records with no duration when computing Time, and say "Not tracked for imported workouts" rather than "None".
- **Effort:** S. **Impact:** med.

**12. The workout detail shows a fake time**
- **Screen:** History → workout.
- **What's wrong:** "Friday, November 20, 2026, 12:00 AM". The workout started Thursday about 11:50 PM and the time shown is a placeholder midnight. The Edit sheet's date input also shows 12:00 AM. The text wraps to two lines.
- **Why it matters:** It looks like a bug, and it puts a late-evening workout on the wrong day.
- **Suggested change:** Store and show the real start time in a short format, "Thu, Nov 19 · 11:48 PM". If no time is known (imports), show the date only.
- **Effort:** S. **Impact:** med.

**13. The advice line and the prefilled reps disagree**
- **Screen:** Logger, when starting a saved workout.
- **What's wrong:** Lat Pulldown said "Same weight: aim for 7 reps on every set", but the Now card and the set rows were prefilled with 6 reps.
- **Why it matters:** Users follow the big number, so the app's own progression advice is silently ignored, and it reads as contradictory.
- **Suggested change:** When a saved workout starts, prefill the reps the advice line names, or drop the advice line for that exercise.
- **Effort:** S. **Impact:** med.

**14. Sheets and menus follow different rules**
- **Duplicate primaries:** Log Activity, Weigh In and Save Workout each have a header "Save" *and* a big bottom primary.
- **Check-in sheet:** "Save" is an orange text row inside a card at the bottom, with no header action.
- **Finish sheet:** "Keep Going" sits on the left and the title "Finish Workout" is off-center, while other sheets center the title.
- **Saved Workouts sheet:** uses "Cancel" to close a browse list.
- **Navigation:** Saved Workouts opens as a sheet, but its sibling rows (Injuries, Exercise Preferences) push pages.
- **Menu casing:** Today ⋯ is Title Case ("Start a Saved Workout", "Add Exercise"). The logger ⋯ and set ⋯ are sentence case ("Save as a workout", "Add a drop set after it"). The page says "Add an exercise".
- **Headers:** centered on most pages, left-aligned on the program page.
- **Why it matters:** Each of these is small, but together they make the app feel assembled rather than designed.
- **Suggested change:** Write a one-page sheet spec:
  - centered title; Cancel on the left, Save/Done on the right;
  - *either* a header action *or* a bottom primary, never both;
  - browse sheets close with "Done";
  - menus in sentence case.
  
  Then apply it across `Sheet.svelte` callers.
- **Effort:** M. **Impact:** med.

**15. Primary actions styled like links next to destructive ones**
- **Screens:** Data and Programs.
- **What's wrong:**
  - After a CSV parse, "Import 14 Workouts" is an orange text row in a card, styled exactly like the red "Erase All Data" card directly below it.
  - "Start Program" and "Start at Week…" are text rows too.
- **Why it matters:** The step that completes the task doesn't look tappable as the main action, and it sits right next to the destructive one.
- **Suggested change:** Make these filled primary buttons. Move Erase All Data into a separated "Danger zone" at the very bottom with extra spacing.
- **Effort:** S. **Impact:** med.

**16. Native browser dialogs**
- **Where:** `confirm()`, `prompt()` and `alert()` are used in 8 places:
  - Data: restore and erase;
  - Programs: start/restart and end;
  - TemplatePicker: rename;
  - LogEditor: discard changes;
  - session: replace a running workout;
  - ProblemScreen.
- **Why it matters:** In the Home Screen app these show as iOS system alerts titled "elibolton.github.io". They're the least polished moments in the app, and they come at the scariest points.
- **Suggested change:** Reuse `ActionMenu` / `Sheet` for confirmations, with a destructive button style. Use an inline text field sheet for rename.
- **Effort:** M. **Impact:** med.

**17. Finishing a workout has no recap**
- **Screen:** Finish → "Workout saved".
- **What's wrong:**
  - After the first workout (all new exercises) the final screen only says "Recovery and your next workout have been updated".
  - Duration, sets and volume appeared on the previous review sheet but not here. PRs show only when beaten.
  - It takes 3 taps to get out.
- **Why it matters:** The end of the first session is the strongest retention moment.
- **Suggested change:**
  - Show a recap on the saved screen: time, sets, volume, "First time: baselines set for 3 exercises", and the next workout's name.
  - Consider merging the review and saved steps when every set was logged (Finish → summary with Save), which gets it down to 2 taps.
- **Effort:** S–M. **Impact:** med.

**18. Today: the readiness card comes before the session**
- **Screen:** Today (generator).
- **What's wrong:**
  - The order is hero → This week → Target readiness (100%, 6 bars all at 100%, "Show all 17 muscles", Body map) → The Session.
  - New users scroll past a wall of 100% bars before seeing a single exercise.
  - Progress then shows a different "Recovery 89%" for the same day, so there are two readiness numbers.
- **Why it matters:** The workout is the content. Readiness is supporting detail, and the two numbers confuse.
- **Suggested change:**
  - Put "The session" right under the hero.
  - Collapse readiness into a chip in the hero ("Target muscles 100% fresh"), with the body map behind it.
  - Use one readiness metric across Today and Progress.
- **Effort:** S. **Impact:** med.

**19. Pickers: swap scope, recents and suggestions**
- **Screens:** Swap, Add Exercise, CSV Match.
- **What's wrong:**
  - **Swap:** the search is limited to same-muscle alternatives but the filter says "All muscles". Searching "curl" gives "No matches. Try a different name or muscle."
  - **Add Exercise:** opens on Barbell Bench Press with no "Recent" or "In this program" section.
  - **CSV Match:** "Zottman Wobble Curl" opens on chest exercises instead of fuzzy suggestions (curls).
- **Why it matters:** Every one of these makes the user search when the app already knows the likely answer.
- **Suggested change:**
  - Swap: label the scope ("Rear-delt alternatives") with a "Search all exercises" escape.
  - Add Exercise: show Recent first.
  - Match: show the top 3 fuzzy matches first.
- **Effort:** M. **Impact:** med.

**20. Rest timer and buttons compete with the main action**
- **Screen:** Logger.
- **What's wrong:**
  - "Skip" on the rest bar is an orange primary sitting right under the orange "Log set".
  - When rest ends, a green "Rest complete / Go" card stays up with "+15s" and an orange "Close" until dismissed.
  - The Finish button is an orange primary from second 0.
- **Why it matters:** Four orange primaries on one screen dilute "Log set", and "Finish" in orange from the start invites ending early.
- **Suggested change:**
  - Make Skip and +15s secondary.
  - Auto-collapse "Rest complete" after about 3 s, keeping only the haptic and color cue.
  - Make Finish a secondary/outline button until most sets are logged.
- **Effort:** S. **Impact:** med.

**21. Injuries give no feedback, and the "no work today" card points at the wrong fix**
- **Screen:** You → Injuries, then Today.
- **What's wrong:**
  - Toggling Shoulder doesn't say what changes.
  - The resulting card, "Nothing for Side Delts fits your equipment…, your injuries and excluded exercises", offers only "Edit equipment", although the injury was the cause.
- **Suggested change:**
  - Under each toggle, show "Leaves out 38 exercises, e.g. overhead press".
  - On the card, offer the action matching the actual cause ("Review injuries").
- **Effort:** S. **Impact:** med.

### LOW

**22. Onboarding: "Where do you train?"**
- **What's wrong:**
  - After customizing (turning on dumbbells and a pull-up bar under "No Equipment") the card is still checked and the name still says "No Equipment" (count 2).
  - Units are buried below the equipment list.
  - The Name field is right-aligned.
  - The floating Back/Next buttons cover content with no fade, and Next overlaps the last goal card on step 1.
- **Suggested change:**
  - Switch to a "Custom" state and name once the user customizes.
  - Move Units to its own step or the top.
  - Left-align inputs.
  - Add a bottom gradient scrim and padding.
- **Effort:** S. **Impact:** low/med.

**23. Plates, bars and weight steps are buried**
- **Screen:** You → gym.
- **What's wrong:** They sit below about 40 equipment toggles.
- **Suggested change:** Add separate rows "Plates & bars" and "Weight steps" under each gym, or a segmented tab at the top of the gym page.
- **Effort:** S. **Impact:** low/med.

**24. Tab bar labels**
- **What's wrong:** Inactive tabs are icon-only and the label appears only on the active pill. The chart and person icons are ambiguous on first use.
- **Suggested change:** Show small labels under inactive icons, or at least for the first week.
- **Effort:** S. **Impact:** low/med.

**25. Exercise page details**
- **What's wrong:**
  - With one session, the Estimated 1RM chart shows a single dot on a 135–136 axis.
  - The page title repeats in the nav bar and the hero.
  - History rows use "100 lb×6" without spaces, while everywhere else uses "100 lb × 6". The drop set isn't marked.
  - Estimated 1RM shows decimals ("135.7 lb", "+6.7 lb"), and curls get a 1RM.
- **Suggested change:**
  - Show "Log 2+ sessions to see a trend" until there are 2 points.
  - Round estimates to the weight step.
  - Use one set formatter.
- **Effort:** S. **Impact:** low.

**26. Spacing and icons**
- **What's wrong:**
  - In Progress → Recent records, the trophy tile touches the exercise name (no gap), unlike the Strength rows above it.
  - The Strength chart line is green while the exercise-page chart is orange.
  - Exercise glyphs are by rough category, so Barbell Curl, EZ Bar Curl and Push Up all show a dumbbell, and abstract arrows stand in for lifts.
  - The drop-set row's ↘ icon has no "Drop" label in the logger.
- **Effort:** S. **Impact:** low.

**27. Data screen feedback**
- **What's wrong:**
  - The CSV parse result ("Found…") renders below the fold without scrolling into view.
  - A manual match vanishes with no "Matched to Dumbbell Curl" confirmation and no undo.
  - "That file isn't a Forge backup." shows as a neutral toast over the header instead of an inline error.
  - The page title "Data" doesn't match its entry row "Backup, Import & Export".
- **Effort:** S. **Impact:** low.

**28. Smaller inconsistencies**
- **Saved-state icon:** saving from history doesn't fill the bookmark icon.
- **Empty states:** Saved Workouts has an icon and title, while Exercise Preferences is a bare sentence.
- **Progress:**
  - a new user's streak "0" is huge and orange;
  - "nice work" is lowercase;
  - volume is formatted "25.1k lb" in one place and "3,500 lb" in another.
- **Today:**
  - "60 MINUTES" and the "60 min" chip duplicate each other;
  - the Switch chip doesn't show the current focus;
  - the generator and Program Today modes have different headers (sliders button present or absent).
- **Effort:** S. **Impact:** low.

---

## Dark-theme contrast notes
- `--text-3` (50% white) on the card surfaces is about 4.4–4.6:1. That's AA at body size, but it's used for 11–12 px captions ("2 left", "None last week", sheet footnotes), where it reads faint. Consider 60% for text under 13 px.
- Orange link text (`#ff9b3d`) on near-black is about 9:1. Fine.
- The main contrast failure is white on the orange gradient (#4).
- The app is dark-only. Light emulation renders the same dark UI, which is fine and consistent with `theme-color #000`.

## State left behind
The built-in browser's `elibolton.github.io` origin now holds the audit's test data:
- 15 workouts (14 from a synthetic CSV);
- an active program;
- a saved "Pull Day";
- a 30-min run;
- a weigh-in.

To start clean, use You → Backup, Import & Export → Erase All Data in that pane. No project files were changed.
