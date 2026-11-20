# Forge home server plan (phase 2)

Phase 2 of [the full build plan](full-build-plan.md). Decided 2026-11-19:
- **Host:** a VM on your Proxmox server.
- **Email:** Resend.
- **Domain:** start free on Tailscale Funnel (`forge.<tailnet>.ts.net`) with Gmail for sign-in emails. Move to a bought domain with Cloudflare and Resend later (see "Moving to a real domain").

## What runs where

```
iPhone (Forge PWA, GitHub Pages)
   │  HTTPS: api.<your-domain>
   ▼
Cloudflare edge ── Cloudflare Tunnel (outbound only, no router ports) ──┐
                                                                        ▼
Proxmox host ─ VM "forge" (Debian 12)
                 ├─ pocketbase   (systemd, 127.0.0.1:8090, SQLite in /var/lib/pocketbase)
                 ├─ cloudflared  (systemd, forwards api.<domain> → 127.0.0.1:8090)
                 └─ nightly backup (sqlite .backup → second disk / NAS share)
PocketBase ── SMTP ──▶ Resend ──▶ sign-in code emails
```

The app stays on GitHub Pages. Only data goes to the VM. The phone stays local-first, so if the server is down, workouts still save on the phone and sync later.

## 1. Decisions still needed

**Domain.** Both Cloudflare Tunnel and Resend need one. Resend only sends from a domain you've verified; without one it can email only your own address.

**Decision (2026-11-20):** start free. Tailscale Funnel gives the VM a public HTTPS address, and Gmail sends the sign-in codes. Steps 4F and 5F below replace steps 4 and 5 for now. Buying a domain later (about $10/year on Cloudflare) changes only the address and the email sender; the server, data and scripts stay the same.

Options:
- **Buy one on Cloudflare (recommended).** About $10/year. The tunnel, DNS and Resend's DNS records are all in one place.
- **Use a domain you own elsewhere.** Move its nameservers to Cloudflare (free), or add only a subdomain if your registrar allows it.
- **No domain at all.** Tailscale Funnel gives the VM a free `*.ts.net` HTTPS address instead of the tunnel. Email then needs Gmail SMTP with an app password, which is less reliable (spam folders), or Resend with a cheap domain anyway.

**Who signs up.** The recommendation is invite-only: you create accounts, or sign-ups need an invite code. It's your server and your disk, and it keeps strangers out.

## 2. The VM

- **Proxmox setup:** a Debian 12 VM (or an unprivileged LXC container) with 1 vCPU, 1 GB RAM and a 16 GB disk. PocketBase uses about 30–60 MB of RAM for a handful of users.
- **Proxmox options:**
  - start at boot: on;
  - QEMU guest agent: on;
  - include it in your existing Proxmox backup schedule (vzdump or PBS).
- **On the VM:**
  - unattended-upgrades for security patches;
  - SSH keys only (password login off);
  - a firewall that allows SSH from your LAN only, and nothing inbound from the internet, since the tunnel is outbound-only.
- **Static IP:** give the VM one with a DHCP reservation.

## 3. PocketBase

- **Install:**
  - Install the pinned release binary (v0.23 or later, which has email one-time-password sign-in built in) to `/opt/pocketbase`. Run it as a `pocketbase` system user, with data in `/var/lib/pocketbase`.
  - Run it as a systemd service, `pocketbase serve --http 127.0.0.1:8090`, with restart=always.
- **Admin:** create the superuser account from the VM itself. The admin UI (`/_/`) is reached only over SSH port-forwarding or the LAN, never through the tunnel; a Cloudflare rule blocks `/_/` publicly.
- **Settings:**
  - App URL: `https://forge.<tailnet>.ts.net` for now, `https://api.<domain>` later.
  - Allowed origins (CORS): `https://elibolton.github.io` and `http://localhost:5179` for development (the `--origins` flag in the service file).
  - Rate limiting: on. Auth endpoints get a strict limit, for example 5 code requests per email per 15 minutes.
- **Sign-in:**
  - Users collection: OTP (email code) on, password sign-in off, OAuth off.
  - Code length 6; codes last 10 minutes.
  - Invite-only: users can't create their own accounts. They get in with an invite code via a small server hook (`pb_hooks`) that checks a code against an `invites` collection, or you create them in the admin.
- **Upgrades:** pin the version, keep a copy of the previous binary, and test the schema on a copy before upgrading.

## 4. Email (Resend)

1. Create a Resend account and add `<domain>`. Put its SPF, DKIM and return-path DNS records in Cloudflare; DMARC is optional, `p=none` to start.
2. Create a sending API key with send-only access for that domain.
3. In PocketBase mail settings, use SMTP:
   - host `smtp.resend.com`, port 465 (TLS);
   - username `resend`, password set to the API key;
   - sender `Forge <login@<domain>>`.
4. Edit the OTP email template so it's short and plain: "Your Forge code is 123456. It expires in 10 minutes."
5. Send a test email and check that it lands in the inbox on iCloud and Gmail addresses.

The free tier allows 3,000 emails a month and 100 a day, far more than a few friends signing in need.

## 5. Cloudflare Tunnel

1. Add the domain to Cloudflare (free plan).
2. Install `cloudflared` on the VM. Run `cloudflared tunnel login`, then `tunnel create forge`.
3. Add an ingress rule: `api.<domain>` → `http://127.0.0.1:8090`. Add a catch-all rule that returns 404.
4. Run `cloudflared service install` to start it at boot.
5. Set up a Cloudflare WAF custom rule that blocks `/_/*` (the admin UI). Optionally add a rate-limit rule on `/api/collections/users/request-otp`.
6. SSL mode: Full. Always Use HTTPS: on.

## 4F. Free path: Tailscale Funnel (now)

Replaces step 5 (Cloudflare Tunnel) until a domain is bought.

1. Create a free Tailscale account. On the VM, `server/funnel.sh` installs Tailscale and runs `tailscale up --hostname forge`.
2. In the Tailscale admin console: DNS → turn on MagicDNS and HTTPS certificates. The first `tailscale funnel` run prints a link to allow Funnel for the VM if your policy doesn't already.
3. Funnel publishes only `/api` (`tailscale funnel --bg --set-path /api http://127.0.0.1:8090/api`). The admin UI at `/_/` is never published, which replaces the Cloudflare WAF rule. The script checks both from the VM.
4. The address is `https://forge.<tailnet>.ts.net`. That's the App URL in PocketBase and the server address the app will use.

Limits: no WAF or edge rate limiting (PocketBase's own rate limiter does that job), and the `ts.net` name includes your tailnet name, which is public in certificate logs.

## 5F. Free path: Gmail (now)

Replaces step 4 (Resend) until a domain is bought.

1. Make a dedicated Gmail account for Forge (keeps your own inbox out of it), turn on 2-step verification, then create an app password (Google Account → Security → App passwords).
2. PocketBase mail settings: SMTP host `smtp.gmail.com`, port 465, TLS on, username the Gmail address, password the app password, sender `Forge <that address>`.
3. Send a test code to an iCloud and a Gmail address. Gmail-to-Gmail lands fine; others may land in spam the first time, so tell friends to mark it "not spam" once.

Gmail allows about 500 emails a day, far more than needed.

## Moving to a real domain (later)

1. Buy the domain on Cloudflare, then do step 5 (tunnel) and step 4 (Resend).
2. In PocketBase, change the App URL and the SMTP settings.
3. Point the app at the new address. Everyone signs in once more; their data is untouched, since it lives on the same server.
4. Turn Funnel off: `tailscale funnel --set-path /api off`.

## 6. Data model (collections)

These mirror the phone's stores. Every record has:
- `owner`: a relation to the user;
- `updatedAt`: client time in milliseconds, used for last-write-wins;
- `deleted`: a tombstone flag;
- `clientId`: the app's own id, unique per owner.

| Collection | Holds | Notes |
|---|---|---|
| `state` | the profile (settings, gyms, plan, program progress, check-ins) and other single values | Keyed by name (`clientId` = `profile`, `kv`). JSON body in the app's own format. |
| `workouts` | workout logs | One record per workout. The JSON body uses the existing log format. |
| `activities` | cardio | |
| `bodyweights` | weigh-ins | |
| `templates` | saved workouts | |
| `friendships` | phase 4 | Defined later. |
| `invites` | invite codes | Admin-only. Made with `server/invite.sh`; used by `POST /api/forge/join`. |

**Access rules** for every data collection:
- list, view, update and delete: `owner = @request.auth.id`;
- create: `@request.auth.id != "" && owner = @request.auth.id`.

Phase 4 adds rules for reading friends' shared items.

Storing bodies as JSON in the app's own format means the server doesn't need to understand workouts, and it can't drift from the app. The app's defensive decoders already handle old and odd data.

## 7. Backups and monitoring

- **Nightly backup:** a systemd timer at 03:00 runs `sqlite3 data.db ".backup …"` (safe while the server is running), compresses the copy, and writes it to a second disk or a NAS share mounted in the VM. It keeps 14 daily and 8 weekly copies.
- **Proxmox:** the VM's own backups (vzdump or PBS) give a second, whole-machine copy.
- **Off-site (optional):** an encrypted `rclone` copy to Backblaze B2 or Cloudflare R2 (cents a month). This is worth doing before friends rely on it.
- **Restore test:** once, restore a backup into a scratch VM and sign in. Write down the steps.
- **Uptime:** a free monitor (UptimeRobot or Healthchecks.io) checks `https://api.<domain>/api/health` every 5 minutes and emails you. The backup job also pings a Healthchecks URL, so a missed backup alerts you.

## 8. Order of work

| Step | Who | Done when |
|---|---|---|
| 1. Create the VM in Proxmox ([server/README.md](../server/README.md) has the settings) | You | You can SSH in |
| 2. Provisioning script: users, PocketBase, systemd, firewall, backup timer | Me (`server/provision.sh`), you run it | `curl 127.0.0.1:8090/api/health` works on the VM |
| 3. Tailscale Funnel (4F) | You run `server/funnel.sh` | `https://forge.<tailnet>.ts.net/api/health` works from your phone on cellular |
| 4. Gmail SMTP (5F) | You (Google account), me (template) | A test code arrives in the inbox |
| 5. Collections and rules as a PocketBase migration in `server/pb_migrations/` | Me | Rules tests pass: user A can't read user B's data |
| 6. Invite hook and invites | Me | Signing in with a valid invite works and a bad one fails |
| 7. Backups, off-site copy, uptime monitor, restore test | Me (scripts), you (accounts) | A restore into a scratch VM works |

After this, phase 3 adds accounts and sync to the app.

## Repo layout added in phase 2

```
server/
  README.md            setup and restore runbook
  provision.sh         idempotent VM setup (Debian 12)
  pocketbase.service
  backup.sh, backup.service, backup.timer
  funnel.sh            Tailscale Funnel (free path)
  cloudflared/config.yml.example   (later, with a domain)
  pb_migrations/       collections + access rules (versioned)
  pb_hooks/            invite check
  tests/               access-rule tests against a throwaway PocketBase
```

No secrets go in the repo. API keys and the tunnel credentials live only on the VM, in `/etc/forge/*.env`, readable by root only.
