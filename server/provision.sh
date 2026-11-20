#!/usr/bin/env bash
# Forge server setup for a fresh Debian 12 VM. Safe to re-run; re-running with a
# new PB_VERSION upgrades PocketBase and keeps the previous binary as pocketbase.prev.
#
#   sudo LAN_CIDR=192.168.1.0/24 ./provision.sh
#
set -euo pipefail

PB_VERSION=${PB_VERSION:-0.40.6}
LAN_CIDR=${LAN_CIDR:-}
BACKUP_DIR=/var/backups/forge
HERE=$(cd "$(dirname "$0")" && pwd)

[ "$(id -u)" = 0 ] || { echo "Run as root (sudo)."; exit 1; }
. /etc/os-release
[ "${VERSION_CODENAME:-}" = bookworm ] || echo "Warning: written for Debian 12 (bookworm), found ${PRETTY_NAME:-unknown}."

if [ -z "$LAN_CIDR" ]; then
  LAN_CIDR=$(ip -o -f inet route show scope link | awk '!/docker|tailscale/ {print $1; exit}')
  echo "LAN_CIDR not set; using $LAN_CIDR for SSH access."
fi

echo "== Packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -y -q curl ca-certificates unzip rsync sqlite3 jq ufw unattended-upgrades qemu-guest-agent
dpkg-reconfigure -f noninteractive unattended-upgrades
systemctl enable --now qemu-guest-agent 2>/dev/null || true

echo "== User and directories"
id pocketbase >/dev/null 2>&1 || useradd --system --home /var/lib/pocketbase --shell /usr/sbin/nologin pocketbase
install -d -o pocketbase -g pocketbase -m 750 /var/lib/pocketbase /var/lib/pocketbase/pb_data
install -d -o pocketbase -g pocketbase -m 750 "$BACKUP_DIR"
install -d -o root -g root -m 700 /etc/forge
install -d -m 755 /opt/pocketbase /opt/pocketbase/pb_hooks /opt/pocketbase/pb_migrations

echo "== PocketBase $PB_VERSION"
arch=$(dpkg --print-architecture)   # amd64 or arm64
current=$(/opt/pocketbase/pocketbase --version 2>/dev/null | awk '{print $NF}' || true)
if [ "$current" != "$PB_VERSION" ]; then
  tmp=$(mktemp -d)
  base="https://github.com/pocketbase/pocketbase/releases/download/v$PB_VERSION"
  zip="pocketbase_${PB_VERSION}_linux_${arch}.zip"
  curl -fsSL -o "$tmp/$zip" "$base/$zip"
  curl -fsSL -o "$tmp/checksums.txt" "$base/checksums.txt"
  (cd "$tmp" && grep " $zip\$" checksums.txt | sha256sum -c -)
  unzip -q -o "$tmp/$zip" pocketbase -d "$tmp"
  [ -f /opt/pocketbase/pocketbase ] && cp -p /opt/pocketbase/pocketbase /opt/pocketbase/pocketbase.prev
  install -m 755 "$tmp/pocketbase" /opt/pocketbase/pocketbase
  rm -rf "$tmp"
  echo "Installed PocketBase $PB_VERSION (was: ${current:-none})."
else
  echo "Already on $PB_VERSION."
fi

# Hooks and migrations from the repo (added in later steps).
for d in pb_hooks pb_migrations; do
  if [ -d "$HERE/$d" ]; then
    rsync -a --delete "$HERE/$d/" "/opt/pocketbase/$d/"
  fi
done
install -m 755 "$HERE/backup.sh" /opt/pocketbase/backup.sh
install -m 755 "$HERE/invite.sh" /opt/pocketbase/invite.sh

echo "== Services"
install -m 644 "$HERE/pocketbase.service" /etc/systemd/system/pocketbase.service
install -m 644 "$HERE/backup.service" /etc/systemd/system/forge-backup.service
install -m 644 "$HERE/backup.timer" /etc/systemd/system/forge-backup.timer
[ -f /etc/forge/backup.env ] || install -m 600 /dev/null /etc/forge/backup.env
systemctl daemon-reload
systemctl enable pocketbase forge-backup.timer
systemctl restart pocketbase
systemctl start forge-backup.timer

echo "== Firewall (SSH from $LAN_CIDR only, nothing else inbound)"
ufw --force default deny incoming
ufw --force default allow outgoing
ufw allow from "$LAN_CIDR" to any port 22 proto tcp
ufw --force enable

echo "== SSH: keys only"
sudo_user_home=$(getent passwd "${ADMIN_USER:-${SUDO_USER:-root}}" | cut -d: -f6)
if [ -s "$sudo_user_home/.ssh/authorized_keys" ]; then
  printf 'PasswordAuthentication no\nKbdInteractiveAuthentication no\nPermitRootLogin prohibit-password\n' > /etc/ssh/sshd_config.d/10-forge.conf
  systemctl reload ssh
else
  echo "Skipped: no SSH key in $sudo_user_home/.ssh/authorized_keys yet (would lock you out). Add one and re-run."
fi

echo "== Health"
for i in $(seq 1 20); do
  if curl -fsS http://127.0.0.1:8090/api/health >/dev/null 2>&1; then
    curl -fsS http://127.0.0.1:8090/api/health; echo
    echo "PocketBase is up. Next: create the admin (see server/README.md), then run ./funnel.sh."
    exit 0
  fi
  sleep 1
done
echo "PocketBase did not answer. Check: journalctl -u pocketbase -n 50"
exit 1
