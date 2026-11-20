# Forge server

PocketBase on a Debian 12 VM, reached through a free Tailscale Funnel address. The full reasoning is in [docs/home-server-plan.md](../docs/home-server-plan.md).

Nothing secret lives in this folder. Passwords and keys stay on the VM in `/etc/forge/` or in PocketBase's own settings.

## 1. Create the VM (Proxmox)

- Debian 12 netinst ISO, 1 vCPU, 1 GB RAM, 16 GB disk, VirtIO network.
- Options: start at boot **on**, QEMU guest agent **on**.
- During install: no desktop, tick "SSH server", make your own user with sudo.
- Give it a fixed address with a DHCP reservation on your router.
- Add it to your Proxmox backup schedule.
- From your Mac: `ssh-copy-id you@<vm-ip>`, so the script can turn password login off.

## 2. Provision

```bash
git clone https://github.com/elibolton/forge.git && cd forge/server
sudo LAN_CIDR=192.168.1.0/24 ./provision.sh    # your home network range
```

This installs PocketBase (checksum-verified) as a locked-down service on `127.0.0.1:8090`, the nightly backup timer, automatic security updates, and a firewall that allows only SSH from your LAN. It ends by printing PocketBase's health check.

Then make the admin account:

```bash
sudo -u pocketbase /opt/pocketbase/pocketbase superuser upsert you@example.com 'a-long-password' --dir=/var/lib/pocketbase/pb_data
```

## 3. Public address (free)

```bash
sudo ./funnel.sh
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
| Upgrade PocketBase | `cd forge && git pull && sudo PB_VERSION=x.y.z server/provision.sh` |
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
