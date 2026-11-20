# Ship audit (2026-11-20)

This is the final interface and feature audit before friends try Forge. Four read-only reviews ran:
- [interface](interface.md): 28 findings, from a screen-by-screen design review;
- [features](features.md): a gap check against Hevy, Strong, Fitbod and Boostcamp;
- [bugs](bugs.md): 16 findings in code written after the first bug hunt;
- [iPhone and accessibility](ios-a11y.md): 21 findings.

IDs refer to those reports: **I** interface, **F** features, **N** bugs, **A** iPhone and accessibility.

**Tap counts are already good:** a set takes 1–2 taps and finishing takes 3. The problems are what covers the screen between taps, and things that silently fail on a real iPhone.

## Ship blockers: fix before inviting anyone

| # | Item | IDs | Effort |
|---|---|---|---|
| 1 | Rest chime is muted by the silent switch and can stay dead after a lock or a call. Resume audio when it isn't running, use the iOS audio session, and say that silent mode mutes it | A1 | S |
| 2 | Data safety: request persistent storage, show a lasting banner when running in a Safari tab, show storage status on Data, and nudge a first backup earlier | A2, F2 | S–M |
| 3 | Install first: when the page isn't installed, onboarding starts with Add to Home Screen, so setup isn't done twice. Update the steps for iOS 26 (Share is under ⋯) | I2, A-install | S–M |
| 4 | Plate rounding: stuck progression, skipped weights, "adding weight" when nothing is added, dip belt pairs, and kg/lb dropping custom plates | N1–N4, N9 | M |
| 5 | Logger overlays: the Log button, rating prompt and rest timer cover the next set's steppers, and a slightly high tap logs a set | I1 | M |
| 6 | Button contrast: white on orange is 2.0–3.3:1. Use dark text or a darker gradient | I4, A4 | S |
| 7 | Steppers may not work with VoiceOver, because they step only on pointerdown | A3 | S |
| 8 | A stale plan can be started after changing injuries. Show what changed and block or refresh before Start | I5 | S–M |

## Strongly recommended for launch

| # | Item | IDs | Effort |
|---|---|---|---|
| 9 | Exercise how-to, history and PRs openable from inside the logger | F1 | S |
| 10 | Rest time per exercise, with a default for added exercises | F3 | S |
| 11 | Today decluttered: one primary action, consistent cards, Start always visible | I3 | M |
| 12 | Check-ins survive a moving block start; the generator respects program deloads; correct deload card title; a program doesn't reset the streak | N5, N6, N10, N11 | S–M |
| 13 | Screen-lock fallback below iOS 18.4: detect a failed wake lock and show a tip | A5 | S |
| 14 | A History list (not only calendar days), with repeat and save-as-workout | I7 | M |
| 15 | Programs: describe the single program plainly (it's tuned to one home gym), give feedback on Start, and consider a 3-day beginner program | I8, F | S–M |
| 16 | Wording and data consistency: reps-left wording everywhere, matching durations, no placeholder "12:00 AM", advice matching the prefill | I10, I-data | S |
| 17 | Reorder sheet layout, truncation at 375 px, note field under 16px zooming the page | I6, I9, A9 | S |
| 18 | Logger focus and VoiceOver announcements: logged sets, rest start and end | A7, A8 | S–M |

## Can wait (after launch)

- **Workouts and exercises:**
  - editing saved workouts and building one from scratch (F4);
  - logging a past workout (F6);
  - workout notes (F7);
  - an exercise library with "fits my gym" filters (F8);
  - a strength card based on the user's own lifts (F9);
  - demo links (F10).
- **Export:** CSV export (F5).
- **Native dialogs:** replace native confirm and prompt dialogs with app sheets, and add a finish-screen recap.
- **Layout:** landscape and notch safe areas (A6), iPhone text size (A10), light mode, chart text alternatives.
- **Performance:** speed up `prescribe` on very long histories (N16).
- **Minor bugs:** N7, N8, N12–N15.

## Can't do as a web app

These should be told to friends up front:
- Apple Health;
- Live Activities and widgets;
- Apple Watch;
- haptics;
- a rest alert while the phone is locked. That last one becomes possible with Web Push once the phase 2 server exists.

## Strengths to protect

- The evidence-based generator.
- Blocks with deloads and check-ins.
- Equipment-exact gyms with plates and bars.
- "Reps left" feeding progression.
- The typo guard.
- Generous import.
- No paywall, and it works offline.
- The one-exercise-per-page logger. Don't clutter it.

## Suggested build order

Three parallel PRs, split by the files they touch:
1. **Logger and iPhone:** items 1, 5, 7, 9, 10, 13, 18 and the note zoom.
2. **Engine:** items 4 and 12.
3. **Shell and screens:** items 2, 3, 6, 8, 11, 14, 15, 16 and 17 (minus the note zoom).

Then a real-iPhone check from the Home Screen before inviting friends.
