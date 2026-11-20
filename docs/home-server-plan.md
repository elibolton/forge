# Forge home server plan (phase 2)

Phase 2 of [the full build plan](full-build-plan.md). Decided 2026-11-19:
- **Host:** a VM on your Proxmox server.
- **Email:** Resend.
- **Domain:** still open (see step 1).

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

**Decision (2026-11-20):** buy a domain on Cloudflare, about $10/year. It's the most reliable choice, and only you can make the purchase. If you'd rather stay free, use Tailscale Funnel with Gmail; only steps 4 and 5 below change. A free eu.org domain is a fallback only, since approval is slow and not guaranteed.

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
  - App URL: `https://api.<domain>`.
  - Allowed origins (CORS): `https://elibolton.github.io` and `http://localhost:5179` for development.
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

## 6. Data model (collections)

These mirror the phone's stores. Every record has:
- `owner`: a relation to the user;
- `updatedAt`: client time in milliseconds, used for last-write-wins;
- `deleted`: a tombstone flag;
- `clientId`: the app's own id, unique per owner.

| Collection | Holds | Notes |
|---|---|---|
| `profiles` | settings, gyms, plan, program progress, check-ins | One per user. Stored as a JSON field, so it follows the app's own format and decoders. |
| `workouts` | workout logs | One record per workout. The JSON body uses the existing log format. |
| `activities` | cardio | |
| `bodyweights` | weigh-ins | |
| `templates` | saved workouts | |
| `friendships` | phase 4 | Defined later. |
| `invites` | invite codes | Admin-only. |

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
| 1. Pick or buy the domain, then add it to Cloudflare | You | The domain shows "Active" in Cloudflare |
| 2. Create the VM in Proxmox | You (I can write the exact settings) | You can SSH in |
| 3. Provisioning script: users, PocketBase, systemd, firewall, backup timer | Me (a script in `server/`), you run it | `curl 127.0.0.1:8090/api/health` works on the VM |
| 4. Tunnel and WAF rule | You run the commands I write | `https://api.<domain>/api/health` works from your phone on cellular |
| 5. Resend: domain, DNS, key, PocketBase SMTP | You (dashboard), me (template) | A test code arrives in the inbox |
| 6. Collections and rules as a PocketBase migration in `server/pb_migrations/` | Me | Rules tests pass: user A can't read user B's data |
| 7. Invite hook and invites | Me | Signing in with a valid invite works and a bad one fails |
| 8. Backups, off-site copy, uptime monitor, restore test | Me (scripts), you (accounts) | A restore into a scratch VM works |

After this, phase 3 adds accounts and sync to the app.

## Repo layout added in phase 2

```
server/
  README.md            setup and restore runbook
  provision.sh         idempotent VM setup (Debian 12)
  pocketbase.service
  backup.sh, backup.service, backup.timer
  cloudflared/config.yml.example
  pb_migrations/       collections + access rules (versioned)
  pb_hooks/            invite check
  tests/               access-rule tests against a throwaway PocketBase
```

No secrets go in the repo. API keys and the tunnel credentials live only on the VM, in `/etc/forge/*.env`, readable by root only.
