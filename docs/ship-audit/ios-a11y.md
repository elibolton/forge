# Forge: iPhone Home Screen and accessibility audit

Date: 2026-11-20. Code read at branch `docs/home-server-plan` (0709a4f). Live site checked at https://elibolton.github.io/forge in the built-in browser (Chromium) at 375x812 and 844x390.

Legend: Effort S/M/L, Impact high/med/low. **[iPhone]** = needs a real iPhone to confirm.

All paths are relative to `web/src/` unless noted.

---

## What is already in good shape

- Manifest is served and valid: `display: standalone`, `scope`/`start_url` `/forge/`, 192/512 icons and a maskable 512. The icon's "F" sits inside the maskable safe circle. The apple-touch-icon is 180x180 and full-bleed, which is correct for iOS.
- `viewport-fit=cover` with `black-translucent` status bar. `--safe-top` and `--safe-bottom` are used on screens, the dock, sheets, the logger, banners and ProblemScreen.
- Service worker (workbox via vite-plugin-pwa) precaches 19 entries: index.html, the JS and CSS bundles, icons, the manifest and all 10 woff2 files. It has a NavigationRoute to index.html and `cleanupOutdatedCaches`, so the app shell works offline. I could not cut the network in the pane, but everything the app needs is in the precache, so offline start should work. **[iPhone]** Confirm in Airplane Mode from the Home Screen.
- Update flow (`lib/pwa.svelte.ts`): uses `prompt` mode, so an update never reloads mid-set. It re-checks on `visibilitychange`, which matters because iOS keeps standalone apps alive for days, and the snooze is handled.
- `navigator.storage.persist()` is requested after load (`lib/store.svelte.ts:293` → `lib/db.ts:116`).
- Backups use `navigator.share({ files })` with an `AbortError` check. The raw backup is read before the tap, so the share keeps its user activation, and there is a correct standalone fallback (`lib/backup.ts`).
- Import uses hidden `<input type="file">` opened from a tap, which works with the iOS Files picker (`screens/Data.svelte:110,127`).
- The logger fits itself to `visualViewport`, so the Log button stays above the keyboard (`screens/ActiveWorkout.svelte:41-58`).
- Wake Lock is requested during a workout and taken again on `visibilitychange`.
- Number inputs use `inputmode` and `enterkeyhint`, and the main inputs are 1rem (16px), so they don't zoom.
- `overscroll-behavior-y: none` on body, and `100dvh` is used where height matters.
- Reduced motion is handled: the global `prefers-reduced-motion` rule uses `!important`, so it also overrides the inline transitions set by the swipe and drag code. `prefers-contrast: more` is also handled.
- The main and dock are `inert` while the logger is open (confirmed live). Sheets restore focus and Escape closes them. RIR chips are a proper radiogroup. Set rows have full spoken labels. The PR icon has `role="img"`. Error banners use `role="alert"`.
- The onboarding page tells Safari users to add Forge to the Home Screen and warns that each copy keeps its own data.
- Text contrast passes on the dark tokens (table below). `--text-3` at 0.5 alpha is the tightest at 4.8–5.0:1.

---

## Findings, ranked

### 1. The rest chime is muted by the silent switch and goes dead after an interruption
- **Issue:** The chime is synthesized with Web Audio. On iOS, Web Audio's default session follows the Ring/Silent switch, and many people keep it on silent at the gym, so the chime doesn't play. Also, after a phone call, Siri, or locking and unlocking, iOS puts the AudioContext into the non-standard state `'interrupted'`. `unlockAudio()` only resumes from `'suspended'`, and `playRestSound` returns early unless the state is `'running'`, so the chime can stay silent for the rest of the workout.
- **iOS:** All versions. Audio Session API (`navigator.audioSession.type`) is in Safari 16.4+. See [MDN Audio Session API](https://developer.mozilla.org/en-US/docs/Web/API/Audio_Session_API), [WebKit bug 251532](https://bugs.webkit.org/show_bug.cgi?id=251532) (`'playback'` ignores the silent switch) and [WebKit bug 264473](https://bugs.webkit.org/show_bug.cgi?id=264473) (`'transient'` was silent on iOS 17).
- **Where:** `lib/session.svelte.ts:656-661` (`unlockAudio`), `lib/sounds.ts:17` (`playRestSound`).
- **Fix:**
  - (a) Change the resume check to `if (this.audio.state !== 'running') this.audio.resume()`, and call `unlockAudio()` on any tap in the logger, not only when a set is logged.
  - (b) Try `navigator.audioSession.type = 'transient'`. It should duck the user's music instead of pausing it. Avoid `'playback'`, which ignores the switch but stops Spotify or Apple Music.
  - (c) Add a line by the sound picker: "Silent mode mutes the timer sound on iPhone."
- **Effort:** S. **Impact:** high. **[iPhone]** Test the switch on and off, with music playing, and after a lock/unlock.

### 2. Data in a Safari tab can be evicted, and that copy is separate from the Home Screen app
- **Issue:** If a friend finishes onboarding in a Safari tab and keeps using it there, the data is subject to Safari's 7-day script-writable storage cap. That copy is also separate from the Home Screen app's copy. After onboarding, nothing reminds Safari-tab users of this. The result of `persist()` is ignored and never shown.
- **iOS:** Home Screen web apps have their own usage counter and are favoured when `persist()` is called ([WebKit: Updates to Storage Policy, Safari 17](https://webkit.org/?p=14403)). A Safari tab gets neither. [WebKit bug 272189](https://bugs.webkit.org/show_bug.cgi?id=272189) is an open report of local data still being lost on iOS 17.
- **Where:** `screens/Onboarding.svelte:123-132` (the only warning), `lib/db.ts:116-118`, `lib/store.svelte.ts:293`.
- **Fix:**
  - When not in standalone mode and there is at least one log, show a persistent, dismissible banner on Today: "You're using Forge in Safari. Workouts here can be deleted by iOS after a week without use. Add to Home Screen and restore a backup."
  - Store the result of `persist()`, call it again after the first finished workout, and show "Storage: protected / not protected" on the Data screen.
  - Make the backup nudge more aggressive when `persisted()` is false.
- **Effort:** S–M. **Impact:** high.

### 3. The weight and reps steppers may ignore a VoiceOver double-tap [iPhone]
- **Issue:** The +/− buttons step on `pointerdown`, and `onclick` only steps when `e.detail === 0` (keyboard or AT). On iOS, a VoiceOver double-tap activates the element through WebKit's accessibility press. That may send a click with `detail >= 1` and no pointerdown before it, in which case nothing happens. For a blind user, logging weight and reps would then be blocked.
- **Where:** `components/ValueStepper.svelte:46-64,76-79`.
- **Fix:** Turn the logic around. Always step in `onclick`, unless a pointer hold already stepped. Set a `heldAt` flag in `hold()`, ignore the click that follows a hold, and clear the flag on `pointercancel`.
- **Effort:** S. **Impact:** high if confirmed. **[iPhone]** Turn on VoiceOver, focus "Increase Weight" and double-tap.

### 4. White text on the ember gradient fails contrast
- **Issue:** `.btn.primary`, `.fab`, the active dock tab, the selected RIR chip and the toggle all put `#fff` on `--ember-gradient`. The ratios are 3.32:1 at the `#ff4d1a` start, 2.60:1 at the `#ff7a2b` middle and 1.95:1 at the `#ffa646` end. RIR chip hints (`white` at 0.8 on `#ff7a2b`) are 2.14:1. The labels ("Log set 3", "Start workout", "Finish", "Skip") are 16–17px at weight 620–700, which is not "large text", so they need 4.5:1. These are the most-used buttons in the app.
- **Where:** `app.css` (`--ember-gradient`, `.btn.primary`, `.fab`), `App.svelte` (`.dock button.on`), `components/RIRChips.svelte` (`.rir.on`).
- **Fix:** Use dark text on the gradient. `#1a0b05` gives roughly 6:1 to 11:1 across the gradient and keeps the look. The alternative is to darken the gradient to about `#d9480f → #c2410c` and keep white text.
- **Effort:** S. **Impact:** high (applies to everyone outdoors or in a bright gym, not only low-vision users).

### 5. On iOS below 18.4, the screen still auto-locks in the Home Screen app
- **Issue:** Wake Lock silently does nothing in Home Screen web apps before iOS 18.4. With the default 30-second Auto-Lock, the phone locks during rest. JS is then suspended, so there is no chime and no timer. Failures are swallowed (`catch {}`), so nobody finds out.
- **iOS:** Fixed in iOS 18.4 ([WebKit bug 254545](https://bugs.webkit.org/show_bug.cgi?id=254545), [Progressier wake lock notes](https://progressier.com/pwa-capabilities/screen-wake-lock)).
- **Where:** `lib/session.svelte.ts:684-692`.
- **Fix:**
  - Record whether the lock was granted.
  - If it wasn't, or if `release` fires while the page is still visible, show a one-time tip in the logger: "Your iPhone may lock during rests. Update iOS or set Auto-Lock to Never while training."
  - Separately, the docs should say rest alerts only work with the screen on. A locked phone never chimes (see 15).
- **Effort:** S. **Impact:** med–high. **[iPhone]** Test on an iOS 17 or 18.0–18.3 device if one of your friends has one.

### 6. Landscape: the logger is unusable and content goes under the notch
- **Issue:** The manifest says `orientation: portrait`, but iOS ignores manifest orientation, so the app rotates. At 844x390 the logger header, the "Exercise 1 of 3" bar, the Log button and the rest bar leave about 40px of scroll area, and the steppers can't be seen (screenshot taken). `env(safe-area-inset-left/right)` is used nowhere, so the Minimize button, the Finish button and the fixed toasts sit under the notch or Dynamic Island in landscape.
- **Where:** `vite.config.ts` (`orientation`), `app.css` (`.screen` padding), `screens/ActiveWorkout.svelte:298-331` (`.logger`, `.head`, `.rest`), `App.svelte` (`.top-stack`).
- **Fix:**
  - Add `--safe-left` and `--safe-right` tokens and use them in `.screen`, `.head`, the logger, `.top-stack` and sheets.
  - Add `@media (orientation: landscape) and (max-height: 500px)` for the logger: hide the position bar, put the Log button and rest bar in a side column, or let the rest bar collapse to one line.
  - At minimum, make the whole logger body scroll so the steppers can be reached.
- **Effort:** M. **Impact:** med (people prop phones sideways on benches, and rotation lock is often off).

### 7. The logger dialog doesn't take focus in or give it back
- **Issue:** Opening the logger makes `main` and the dock `inert`. The button that was tapped (Start workout or the MiniBar) becomes inert while it has focus, and focus falls to `<body>`; in the live check `document.activeElement` was `body` with the logger open. VoiceOver then lands somewhere arbitrary. Minimizing doesn't put focus back on the MiniBar, and Escape doesn't close or minimize it. Sheets already handle this through `openOverlay`; the logger doesn't use it.
- **Where:** `screens/ActiveWorkout.svelte:132` (the dialog), `components/MiniBar.svelte:23`.
- **Fix:** On mount, `openOverlay(() => session.isExpanded = false)` and focus the dialog (`tabindex="-1"`) or its title. On minimize, focus the MiniBar.
- **Effort:** S. **Impact:** med (VoiceOver and keyboard).

### 8. VoiceOver isn't told about stepper changes, set logs, rest start/end or toasts in the logger
- **Issue:**
  - Stepper +/−: focus stays on "Increase Weight" and the new value is never spoken, because it sits in a separate input.
  - Logging a set: the button label changes to "Log set 4", but there is no "Set 3 logged, rest 2:00".
  - Rest timer: `role="timer" aria-live="off"`, so the end of rest is never announced. That is correct for every tick, but the ending needs one announcement.
  - Toasts (PRs, Undo) live in `.top-stack`, portalled to `<body>` outside the `aria-modal` logger. WebKit hides content outside an aria-modal dialog from VoiceOver, and its live regions may be suppressed too. **[iPhone]**
- **Where:**
  - `components/ValueStepper.svelte`
  - `components/ExercisePage.svelte` (`log()`)
  - `components/RestTimerBar.svelte:22`
  - `components/ToastHost.svelte:8`
  - `App.svelte` (`.top-stack`)
- **Fix:**
  - Add one shared visually-hidden `aria-live="polite"` region inside the logger and an `announce(text)` helper.
  - Call it with "Weight 115 pounds" after a step (debounced while holding), "Set 3 logged. Rest 2 minutes", and "Rest over" once when `remaining` reaches 0.
  - While the logger is open, also send toast messages through that region.
- **Effort:** S–M. **Impact:** med.

### 9. The exercise note field zooms the page on focus
- **Issue:** `.note-field { font-size: 0.9rem }` is 14.4px. iOS Safari zooms any focused field under 16px, and in standalone mode the page stays zoomed after blur until the user pinches back.
- **Where:** `components/ExerciseNote.svelte:31`.
- **Fix:** Use `font-size: 1rem`, or `max(16px, 0.9rem)`. As a guard, add `font-size: max(16px, 1em)` to the global input/textarea rule in `app.css`.
- **Effort:** S. **Impact:** med (it's in the logger mid-workout).

### 10. Dynamic Type and the iOS text-size setting are ignored
- **Issue:** The root is a fixed `font-size: 16px`, so the iPhone's Larger Text setting has no effect. Safari only maps Dynamic Type through the `-apple-system-*` font keywords. Pinch-zoom still works, since no `maximum-scale` is set, which is good. Most sizes are in rem, so scaling the root would carry through, but a few things are fixed px: the 64px dock, 44px icon buttons, the 84px `.amount` field and the 340px dock width.
- **iOS:** All versions; see [WebKit: Dynamic Type for the web](https://webkit.org/blog/3709/using-the-system-font-in-web-content/).
- **Where:** `app.css` `:root`.
- **Fix:** Use `html { font: -apple-system-body; }` (with `@supports`), then put the family back with `font-family: var(--font)` and keep the `16px` fallback elsewhere. Cap headline growth with `clamp()` where the logger's numerals would overflow (`ValueStepper` sizes use rem: check at AX5). Turn fixed px heights into `min-height` in rem.
- **Effort:** M–L. **Impact:** med. **[iPhone]** Check at the largest accessibility size.

---

### 11. The keyboard can cover the Save buttons in sheets [iPhone]
- **Issue:** Only the logger follows `visualViewport`. `Sheet` is `position: fixed; bottom: 0` with `max-height: calc(100dvh - …)`. On iOS, `dvh` doesn't shrink for the keyboard, so the bottom of a sheet goes under the keyboard. This affects the template name (`SaveTemplateSheet`, where Enter saves, so it's OK), `CustomExerciseEditor` (textarea and Save), `Bodyweight`, `ActivitySheet` and `LogEditor`. Safari doesn't support `interactive-widget=resizes-content`.
- **Where:** `components/Sheet.svelte:94-107`.
- **Fix:** Move the visualViewport logic into a shared action and apply it to `.sheet` (set `bottom` to `innerHeight - vv.height - vv.offsetTop`). Or put the primary action in the sheet header (the `trailing` snippet), where it can't be covered.
- **Effort:** M. **Impact:** med.

### 12. Fast taps can double-tap-zoom, and a long press selects button text
- **Issue:** `touch-action: manipulation` and `-webkit-touch-callout: none` / `user-select: none` are only set on the stepper buttons and RIR chips. Fast repeat taps on +15s, Add set, Previous/Next exercise or the RIR chips in compact mode can trigger double-tap zoom on iOS. A long press on any other button starts text selection or the loupe.
- **Where:** `app.css` (`button` rule).
- **Fix:** Use `button, .chip, [role="tab"], .item { touch-action: manipulation; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }`, and keep text selectable in inputs and notes.
- **Effort:** S. **Impact:** low–med. **[iPhone]**

### 13. The Add to Home Screen steps are out of date for iOS 26
- **Issue:** In iOS 26's default compact Safari layout, Share is under the "⋯" button, not in a toolbar. The sheet now shows an "Open as Web App" toggle, which must stay on; if it's turned off, Forge is saved as a bookmark that opens in Safari, with Safari's storage.
- **iOS:** 26 ([heise](https://heise.de/-10749652), [iDownloadBlog](https://www.idownloadblog.com/?p=1042117), [WebKit Safari 26](https://webkit.org/?p=17333)).
- **Where:** `screens/Onboarding.svelte:127-131`.
- **Fix:** Use "Tap ⋯ (or Share) → Share → Add to Home Screen → keep **Open as Web App** on → Add". Branch the copy on iOS version only if you care about iOS 17/18.
- **Effort:** S. **Impact:** med (it's the install path for every friend).

### 14. Charts have only a title, not the data
- **Issue:** `LineChart` exposes "Estimated one rep max trend" and nothing else. Both the `<figure>` and the `<svg role="img">` have the same `aria-label`, so VoiceOver may read it twice. The BodyMap images say "Front view" / "Back view" without muscle states. The list below the body map covers that, so it's fine.
- **Where:** `components/LineChart.svelte:29-30`; used in `screens/Progress.svelte:136`, `screens/ExerciseDetail.svelte:106` and `components/Bodyweight.svelte:73`.
- **Fix:** Build a summary inside the component, such as "Bench Press: 185 to 205 lb, Sep 3 to Nov 18, 9 sessions, best 205". Put it in the svg `aria-label` (or a `<figcaption class="sr-only">`) and drop the figure's `aria-label`.
- **Effort:** S. **Impact:** med (VoiceOver).

### 15. A locked phone means no rest alert at all
- **Issue:** `setTimeout` and Web Audio don't run in a suspended standalone app. The only way to alert on a locked phone is Web Push, which is available to Home Screen apps on iOS 16.4+, needs a server to send it at the right time, and must show visibly or iOS revokes the permission. There are no local scheduled notifications on iOS.
- **iOS:** 16.4+ ([WebKit: Web Push for Web Apps](https://webkit.org/?p=13878), [Apple forums: no scheduled notifications](https://developer.apple.com/forums/thread/735402), [Declarative Web Push](https://webkit.org/?p=16535)).
- **Where:** `lib/session.svelte.ts:663-676`.
- **Fix:** For now, say so in Settings ("Keep Forge open to hear the rest timer"). In phase 2, the home PocketBase server can send a push at `restEndsAt`: ask permission from a tap and cancel the push when Skip is tapped. Don't use the silent-audio-loop hack: it stops the user's music and drains the battery.
- **Effort:** L (phase 2). **Impact:** med.

### 16. Low-contrast borders on fields and controls
- **Issue:** Inputs are `surface-2` with a `hairline` border, at 1.15:1 against a card. The toggle off-track is 1.31:1 against a card. Card and list hairlines are about 1.2–1.35:1. WCAG 1.4.11 asks for 3:1 for the boundary that identifies a control. The `prefers-contrast: more` override helps, but only `--hairline` is raised there.
- **Where:** `app.css` (input rule, `.toggle span`, `--hairline`).
- **Fix:** Give inputs and the toggle track `border-color: rgba(255,255,255,0.28)`, about 3:1 on a card. Leave decorative card hairlines alone.
- **Effort:** S. **Impact:** low–med.

### 17. Small spoken-label bugs
- `screens/ActiveWorkout.svelte:137`: `aria-label="Elapsed time"` on a div replaces the time, so VoiceOver says "Elapsed time" with no number (confirmed in the live accessibility tree). Fix: `<span class="sr-only">Elapsed </span>{time}`, without the aria-label. S/low.
- `components/ValueStepper.svelte:70`: `"{title} in {unit}"` gives **"Reps in reps"** (seen live). Fix: skip the "in" when the unit and the title match, or use "Reps". S/low.
- `components/ExercisePage.svelte` (set row label): `${rirText(...)} reps left` gives **"1 reps left"** (seen live). Pluralize it. S/low.
- `components/WeekStrip.svelte:32`: the day labels don't say which day is today. Add ", today". S/low.
- `screens/ActiveWorkout.svelte:154`: the swipe hint is a `role="status"` that replaces "Exercise 1 of N" for 6 seconds. VoiceOver hears "Swipe to change exercise", which is the wrong gesture for VoiceOver users. Add `aria-hidden` and keep the "Exercise x of N" text for AT. S/low.

### 18. No iOS launch images
- **Issue:** iOS doesn't build a splash from the manifest's `background_color`. Without `apple-touch-startup-image`, a cold launch shows a plain (usually white) screen until first paint, which flashes against the black app.
- **Where:** `index.html`.
- **Fix:** Generate startup images, for example with `pwa-asset-generator`, for current iPhone sizes, or accept the flash. Startup is fast because the shell is precached.
- **Effort:** S–M. **Impact:** low. **[iPhone]**

### 19. Edge-swipe back in a Safari tab
- **Issue:** In a Safari tab (not standalone), Safari's own left-edge back swipe and Forge's custom swipe (`App.svelte:46-108`) can both fire. Forge's `nav.pop()` calls `history.back()`, and Safari's gesture also pops history, which can go back two levels. In standalone there is no system back gesture, so it's fine there. iOS ignores `preventDefault` on system edge gestures.
- **Fix:** Turn the custom swipe on only when in standalone mode (`matchMedia('(display-mode: standalone)')`).
- **Effort:** S. **Impact:** low. **[iPhone]**

### 20. No haptics on iPhone
- **Issue:** `navigator.vibrate` doesn't exist on iOS, so the PR buzz and the rest buzz do nothing. That's fine because they're guarded with `?.`. The only iOS haptic from the web is the `<input type="checkbox" switch>` toggle (Safari 17.4+/iOS 18). Clicking a hidden one is a known hack, but it's fragile.
- **Where:** `screens/ActiveWorkout.svelte:107`, `lib/session.svelte.ts:674`.
- **Fix:** Optional. Make `components/Toggle.svelte` a native `switch` input so settings toggles get system haptics for free. Skip the hack.
- **Effort:** S. **Impact:** low.

### 21. Dark mode only
- **Issue:** `color-scheme: dark` with no light theme. That's a valid design choice: native pickers and the keyboard render dark and the status bar matches. Users who rely on light mode or Smart Invert get dark anyway. Smart Invert will re-invert the photos/thumbs unless they're marked; add `img { filter: none }` under `@media (inverted-colors: inverted)` only if that becomes a complaint.
- **Effort:** — **Impact:** low.

---

## Contrast table (WCAG 2.x, dark theme)

Text tokens over the main surfaces (alpha blended):

| Foreground | bg #070708 | card | chip on card | sheet | toast | dock |
|---|---|---|---|---|---|---|
| --text | 18.7 | 17.2 | 15.3 | 16.6 | 15.6 | 17.3 |
| --text-2 (0.64) | 7.7 | 7.5 | 7.0 | 7.4 | 7.1 | 7.5 |
| --text-3 (0.50) | 5.0 | 5.0 | **4.8** | 4.9 | 4.9 | 5.0 |
| --ember #ff5a1f | 6.5 | 6.0 | 5.3 | 5.7 | 5.4 | 6.0 |
| --ember-2 #ff9b3d | 9.6 | 8.9 | 7.9 | 8.5 | 8.0 | 8.9 |
| --fresh | 13.6 | 12.5 | 11.1 | 12.1 | 11.3 | 12.6 |
| --recovering | 11.9 | 11.0 | 9.8 | 10.6 | 10.0 | 11.1 |
| --fatigued #ff4d6d | 6.3 | 5.8 | 5.1 | 5.6 | 5.2 | 5.8 |

All text tokens pass AA (4.5:1). `--text-3` leaves little margin, and it's used at 0.6–0.68rem in `.eyebrow`, so don't lower it any further.

Failures:
- White on the ember gradient: 3.32 / 2.60 / 1.95 (finding 4).
- White at 0.8 on `#ff7a2b` (RIR chip hint): 2.14.
- Input border: 1.15 (non-text, finding 16).
- Toggle off-track: 1.31.
- Disabled controls (`opacity: .35`) are about 3:1. That's exempt, but they're hard to see in daylight.

Passes: segmented "on" (`#0b0b0d` on `--text`) is 18.2, and chip.on (`--ember-2` on ember-soft) is 7.4.

Script: `/private/tmp/claude-501/-Users-elibolton-Documents-Repos-WOrkout-app/45d00cf0-46f0-4527-8e51-4ef6c99926f9/scratchpad/contrast.py`.

## Needs a real iPhone

1 (silent switch, interruption), 3 (VoiceOver double-tap on the stepper), 5 (wake lock on older iOS), 8 (toasts inside the aria-modal logger), 10 (Dynamic Type), 11 (keyboard over sheets), 12 (double-tap zoom), 18 (launch flash), 19 (Safari edge swipe), and offline cold start from the Home Screen in Airplane Mode.

## Note from the live check

My test tab shared IndexedDB with another Forge tab in the same browser profile. A workout ("Pull Day") appeared and the sync "Forge changed in another window" banner showed up while I was reading. The sync feature behaved as designed. I didn't log, finish or discard anything.
