# Forge (web)

The Forge workout app as an installable web app, so it runs on an iPhone from the Home Screen without an Apple
developer account. It's a TypeScript port of the Swift app in `../App` and `../WorkoutEngine`, which stay in the repo.

- `src/engine/` — the workout engine (planner, recovery, programs, progression, CSV import), ported from
  `WorkoutEngine` with its tests (`*.test.ts`).
- `src/lib/` — app state, saved to IndexedDB on the device.
- `src/screens/`, `src/components/` — the UI (Svelte 5).

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # engine tests
npm run check      # type check
npm run build      # production build in dist/
```

## Put it on your iPhone

1. Push the repo to GitHub and set **Settings → Pages → Source** to **GitHub Actions**. The workflow in
   `.github/workflows/pages.yml` builds and publishes on every push to `main`, merged pull requests included.
2. Open the Pages URL in Safari on the iPhone, tap **Share → Add to Home Screen**, and open Forge from there.

Data lives only on the device, inside the Home Screen app's own storage. Use **You → Backup, Import & Export**
to export a backup now and then.

## Differences from the iOS app

- Rest timer alerts chime and vibrate only while the app is open; a web app can't schedule a notification
  for when the phone is locked. The screen stays awake during a workout instead.
- Reordering exercises mid-workout uses up/down buttons rather than drag.
