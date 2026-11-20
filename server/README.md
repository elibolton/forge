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
- **Mail (Gmail):** SMTP on, host `smtp.gmail.com`, port 465, TLS, username and app password of the Forge Gmail account, sender `Forge <that address>`. Send a test email.
- **Rate limits:** on.
- **users collection → Options:** OTP on (6 digits, 10 minutes), password auth off, OAuth off.

Collections, access rules and the invite check arrive as migrations and hooks in the next steps; re-running `provision.sh` installs them.

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
