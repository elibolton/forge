#!/usr/bin/env bash
# Free public HTTPS address via Tailscale Funnel. Publishes only /api, never the
# admin UI at /_/.
#
#   sudo ./funnel.sh
#
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "Run as root (sudo)."; exit 1; }

if ! command -v tailscale >/dev/null; then
  echo "== Installing Tailscale (official apt repository)"
  . /etc/os-release
  curl -fsSL "https://pkgs.tailscale.com/stable/debian/$VERSION_CODENAME.noarmor.gpg" \
    -o /usr/share/keyrings/tailscale-archive-keyring.gpg
  curl -fsSL "https://pkgs.tailscale.com/stable/debian/$VERSION_CODENAME.tailscale-keyring.list" \
    -o /etc/apt/sources.list.d/tailscale.list
  apt-get update -q && apt-get install -y -q tailscale jq
fi

if ! tailscale status >/dev/null 2>&1; then
  echo "== Sign in: open the link below on any device"
  tailscale up --hostname=forge
fi

echo "== Funnel /api -> PocketBase"
# If Funnel isn't allowed for this machine yet, this prints a link to allow it.
tailscale funnel --bg --set-path=/api http://127.0.0.1:8090/api

name=$(tailscale status --json | jq -r '.Self.DNSName' | sed 's/\.$//')
url="https://$name"

echo "== Checking $url (certificates can take a minute the first time)"
ok=""
for i in $(seq 1 30); do
  if curl -fsS -m 10 "$url/api/health" >/dev/null 2>&1; then ok=1; break; fi
  sleep 4
done
[ -n "$ok" ] || { echo "No answer from $url/api/health. Check: tailscale funnel status"; exit 1; }

admin=$(curl -s -o /dev/null -w '%{http_code}' -m 10 "$url/_/" || true)
if [ "$admin" = 200 ]; then
  echo "WARNING: the admin UI is reachable at $url/_/ . Run: tailscale funnel reset   and re-run this script."
  exit 1
fi

echo
echo "Public address: $url"
echo "  $url/api/health  works"
echo "  $url/_/          blocked ($admin)"
echo "Set this as the Application URL in PocketBase settings."
echo "Then check $url/api/health from your phone on cellular (Wi-Fi off)."
