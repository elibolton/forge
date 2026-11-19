# Forge: full build plan

Goal: Forge that you and a group of friends can rely on, with accounts, sync to a server at home, friends features, and the open roadmap items done. Decided 2026-11-19.

## Architecture

- **The app stays on GitHub Pages.** Only data goes to the home server.
- **Local-first.** Each phone keeps saving to IndexedDB as it does now and syncs when it can reach the server. A server outage never loses a workout.
- **Server: PocketBase** on an always-on home machine (Mac mini, Raspberry Pi 4/5, or a NAS with Docker). It's one program with a SQLite database, email sign-in, access rules per collection and live updates.
- **Reachability:** a Cloudflare Tunnel gives the server an HTTPS address on your own domain without opening router ports.
- **Sign-in:** email plus a 6-digit code. A tapped link would open in Safari, whose storage is separate from the Home Screen app, so the session would land in the wrong place.
- **Sync model:** every record (profile, workouts, cardio, weigh-ins, saved workouts) carries `updatedAt`. Sync is per record and last write wins; deletes become tombstones. On first sign-in the existing local data uploads.

## Phases

0. **Debug phase (now).** Find and fix as many bugs and edge cases as possible before anyone else uses the app. See below.
1. **Finish the roadmap.**
   - Plate settings for each gym.
   - A fatigue check-in for generated workouts, so a block can stretch to 7 loading weeks.
   - A polish pass from a new user's point of view.
2. **Home server.**
   - PocketBase, the Cloudflare Tunnel and an SMTP sender for sign-in codes.
   - Collections that mirror the phone's stores.
   - Access rules: you can read only your own data and what friends share with you.
   - Nightly database backups to a second drive, and an uptime check.
3. **Accounts and sync in the app.**
   - Signing in is optional; the app works signed out as it does today.
   - Existing data uploads on first sign-in, then changes sync both ways.
   - A sync status indicator.
   - Export, sign-out and account deletion.
4. **Friends.**
   - Usernames, invite links and friend requests.
   - A feed of workouts and PRs, with reactions.
   - Sharing saved workouts and programs.
   - Weekly challenges.
   - Privacy settings: share everything, PRs only or nothing, plus hiding a single workout.
5. **Invite friends.** An invite flow, a short privacy note (their data lives on your server), a feedback channel, and fixes from the first weeks of real use.

Before phase 2, you need to pick the home machine, register a domain on Cloudflare, and choose an SMTP sender.

## Debug phase method

1. **Baseline:** the tests, the type check and the build all pass.
2. **Parallel review by area.** Each reviewer reads the code, writes throwaway tests to reproduce problems, and reports findings with steps to reproduce. Reviewers don't fix anything. The areas:
   - the workout builder (planner, blocks, quality, templates);
   - programs and progression;
   - the live workout logger and finishing a workout;
   - storage, decoding, backup and import;
   - screens and interaction.
3. **Fuzzing the workout builder:** every goal × level × split × length × gym × injury combination, checking invariants:
   - no crash;
   - the workout fits the time;
   - only equipment the gym has;
   - no excluded or injury-risk exercises;
   - finite, non-negative loads;
   - at least one working set per exercise.
4. **Browser exploration** at phone size: first run, a full workout, editing, units, gyms, programs, backups.
5. **Triage:** reproduce each finding, rank it (data loss > wrong training advice > crashes or stuck UI > cosmetic), then fix it in batches. Each fix gets a regression test where one is possible.
