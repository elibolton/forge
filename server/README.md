# Forge server

PocketBase on a Debian 12 VM, reached through a free Tailscale Funnel address. The full reasoning is in [docs/home-server-plan.md](../docs/home-server-plan.md).

Nothing secret lives in this folder. Passwords and keys stay on the VM in `/etc/forge/` or in PocketBase's own settings.

## 1. Create and provision the VM (one command)

In Proxmox, open the node's **Shell** (as root) and run:

```bash
curl -fsSL https://raw.githubusercontent.com/elibolton/forge/main/server/create-vm.sh -o create-vm.sh
bash create-vm.sh --key "ssh-ed25519 AAAA... you@mac"
```

Paste your Mac's public key (`cat ~/.ssh/id_ed25519.pub`) as `--key`. The script:
- downloads the official Debian 12 cloud image and checks its checksum;
- creates the VM (1 CPU, 1 GB, 16 GB on `local-lvm`, `vmbr0`, guest agent, start at boot);
- has cloud-init make the `forge` user with only your SSH key (no passwords anywhere);
- clones this repo on the VM and runs `provision.sh`, which installs PocketBase, the backup timer, automatic security updates and a firewall allowing only SSH from your LAN;
- waits, then prints the VM's address and PocketBase's health.

Options: `--vmid`, `--name`, `--storage`, `--bridge`, `--disk`, `--memory`, `--cores`, `--user`, `--lan`, `--branch`. It needs one storage with "Snippets" content enabled for the cloud-init file, and tells you if there isn't one.

Afterwards, add the VM to your Proxmox backup schedule and give it a DHCP reservation on your router.

### By hand instead

Debian 12 netinst, the same sizes, "SSH server" ticked, then `ssh-copy-id`, `git clone` this repo and `sudo LAN_CIDR=<your LAN> server/provision.sh`.

## 2. Admin account

SSH in (`ssh forge@<vm-ip>`) and make the admin account:

```bash
sudo -u pocketbase /opt/pocketbase/pocketbase superuser upsert you@example.com 'a-long-password' --dir=/var/lib/pocketbase/pb_data
```

## 3. Public address (free)

```bash
cd /opt/forge-src/server && sudo ./funnel.sh
```

Sign in to Tailscale with the link it prints. If it prints a second link, open it to allow Funnel for this machine. It ends with your address, `https://forge.<tailnet>.ts.net`, and checks that `/api` is public and the admin UI is not.

Check `https://forge.<tailnet>.ts.net/api/health` from your phone with Wi-Fi off.

## 4. PocketBase settings

The admin UI is never public. Open it through SSH from your Mac:

```bash
ssh -L 8090:127.0.0.1:8090 you@<vm-ip>
```

Then browse to http://localhost:8090/_/ and set:

- **Application:** URL `https://forge.<tailnet>.ts.net`, name "Forge".
- **Mail (Gmail):** SMTP on, host `smtp.gmail.com`, port 465, TLS encryption **Always**, username and app password of the Forge Gmail account, sender `Forge <that address>`. Send a test email. A 535 "Username and Password not accepted" means the app password belongs to a different Google account (check the account switcher before creating it) or 2-Step Verification isn't on.
- **Rate limits:** on. After Funnel is set up, also turn on **IP proxy headers** (`X-Forwarded-For`), or every user counts as the same IP (127.0.0.1) and shares one limit.
- **IP proxy headers:** `X-Forwarded-For`, rightmost (after Funnel).

The migrations in `pb_migrations/` set up the rest when PocketBase starts: email-code sign-in only (6 digits, 10 minutes, no passwords), the data collections with their access rules, the `invites` collection, and rate limits for joining and for sign-in codes.

Sign-up is open: asking for a sign-in code with a new email creates the account (`pb_hooks/signup.pb.js`). Accounts can't be created any other way, and the sign-in code limit (5 per 15 minutes per address) caps abuse. To go back to invite-only, delete `signup.pb.js` and re-run `provision.sh`.

## 5. Invite codes (optional, not needed while sign-up is open)

```bash
sudo /opt/pocketbase/invite.sh                     # 1 use, valid 14 days
sudo /opt/pocketbase/invite.sh 5 30 "gym friends"  # 5 uses, 30 days
sudo /opt/pocketbase/invite.sh list
```

A friend enters their email and the code once (`POST /api/forge/join`), which creates their account; after that they sign in with an emailed code. Someone already joined can re-enter a code without using it up.

## Data on the server

| Collection | Holds |
|---|---|
| `workouts` | workout logs |
| `activities` | cardio |
| `bodyweights` | weigh-ins |
| `templates` | saved workouts |
| `state` | single values such as the profile, keyed by name |
| `invites` | invite codes (admin only) |

Each data record has `owner`, `clientId` (the app's id, unique per owner), `body` (the app's own JSON), `updatedAt` (client ms, last write wins), `deleted` (tombstone) and server `created`/`updated` (`updated` is the sync cursor). Every rule is "owner = the signed-in user"; the owner can't be changed, and deleting a user deletes their data.

Tests: `server/tests/run.sh` starts a throwaway PocketBase in Docker with these migrations and checks the rules and the invite flow (needs Docker and Node).

## Everyday

| Task | Command |
|---|---|
| Status / logs | `systemctl status pocketbase` / `journalctl -u pocketbase -f` |
| Run a backup now | `sudo systemctl start forge-backup` |
| See backups | `ls -lh /var/backups/forge/daily` |
| Upgrade PocketBase | `cd /opt/forge-src && sudo git pull && sudo PB_VERSION=x.y.z LAN_CIDR=<your LAN> server/provision.sh` |
| Roll back the binary | `sudo cp /opt/pocketbase/pocketbase.prev /opt/pocketbase/pocketbase && sudo systemctl restart pocketbase` |

Backups keep 14 daily and 8 weekly copies in `/var/backups/forge`. To keep them off the VM's disk, mount a second disk or a NAS share there before provisioning. For a missed-backup alert, put `HC_URL=https://hc-ping.com/<uuid>` in `/etc/forge/backup.env`.

## Restore

```bash
sudo systemctl stop pocketbase
gunzip -c /var/backups/forge/daily/forge-YYYY-MM-DD.db.gz | sudo -u pocketbase tee /var/lib/pocketbase/pb_data/data.db >/dev/null
sudo rm -f /var/lib/pocketbase/pb_data/data.db-wal /var/lib/pocketbase/pb_data/data.db-shm
sudo systemctl start pocketbase
```

Test this once in a scratch VM before friends rely on it.
