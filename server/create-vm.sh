#!/usr/bin/env bash
# One-shot Forge VM for Proxmox. Run as root on the Proxmox node (its web Shell works):
#
#   curl -fsSL https://raw.githubusercontent.com/elibolton/forge/main/server/create-vm.sh -o create-vm.sh
#   bash create-vm.sh --key "ssh-ed25519 AAAA... you@mac"
#
# It downloads the official Debian 12 cloud image (checksum-verified), creates the VM,
# and lets cloud-init make your user (SSH key only, no passwords), install git and
# run server/provision.sh. When it finishes, PocketBase is running on the VM.
set -euo pipefail

VMID=""; NAME=forge; STORAGE=local-lvm; BRIDGE=vmbr0; DISK=16G; MEM=1024; CORES=1
USERNAME=forge; KEY=""; LAN_CIDR=""; REPO=https://github.com/elibolton/forge.git; BRANCH=main
IMG_URL=https://cloud.debian.org/images/cloud/bookworm/latest
IMG=debian-12-genericcloud-amd64.qcow2

usage() { sed -n '2,10p' "$0"; echo "Options: --vmid N --name forge --storage local-lvm --bridge vmbr0 --disk 16G --memory 1024 --cores 1 --user forge --key 'ssh-…' | --key-file path --lan 192.168.4.0/22 --branch main"; exit 1; }
while [ $# -gt 0 ]; do
  case $1 in
    --vmid) VMID=$2; shift 2;; --name) NAME=$2; shift 2;; --storage) STORAGE=$2; shift 2;;
    --bridge) BRIDGE=$2; shift 2;; --disk) DISK=$2; shift 2;; --memory) MEM=$2; shift 2;;
    --cores) CORES=$2; shift 2;; --user) USERNAME=$2; shift 2;; --key) KEY=$2; shift 2;;
    --key-file) KEY=$(cat "$2"); shift 2;; --lan) LAN_CIDR=$2; shift 2;; --branch) BRANCH=$2; shift 2;;
    *) usage;;
  esac
done

[ "$(id -u)" = 0 ] && command -v qm >/dev/null || { echo "Run this as root on a Proxmox node."; exit 1; }
case "$KEY" in ssh-*|ecdsa-*) ;; *) echo "Need your SSH public key: --key \"\$(cat ~/.ssh/id_ed25519.pub)\" from your Mac."; exit 1;; esac
VMID=${VMID:-$(pvesh get /cluster/nextid)}
qm status "$VMID" >/dev/null 2>&1 && { echo "VM $VMID already exists. Pick another with --vmid."; exit 1; }
if [ -z "$LAN_CIDR" ]; then
  LAN_CIDR=$(ip -o -f inet addr show "$BRIDGE" | awk '{print $4; exit}' | python3 -c 'import ipaddress,sys; print(ipaddress.ip_interface(sys.stdin.read().strip()).network)')
fi

# Cloud-init user-data has to live on a storage that allows "snippets".
SNIP_STORE=$(pvesm status --content snippets 2>/dev/null | awk 'NR>1 && $3=="active" {print $1; exit}')
[ -n "$SNIP_STORE" ] || { echo "No active storage allows snippets. Enable it on one: Datacenter > Storage > (dir storage) > Content > Snippets."; exit 1; }
SNIP_DIR=$(pvesm path "$SNIP_STORE:snippets/x" | sed 's#/x$##')
mkdir -p "$SNIP_DIR"

echo "== VM $VMID '$NAME' on $(hostname): $CORES CPU, ${MEM} MB, $DISK on $STORAGE, $BRIDGE, SSH from $LAN_CIDR"

echo "== Debian 12 cloud image"
CACHE=/var/lib/vz/template/cache; mkdir -p "$CACHE"
curl -fsSL -o "$CACHE/SHA512SUMS.debian12" "$IMG_URL/SHA512SUMS"
if ! (cd "$CACHE" && grep " $IMG\$" SHA512SUMS.debian12 | sha512sum -c --status - 2>/dev/null); then
  curl -fL --progress-bar -o "$CACHE/$IMG" "$IMG_URL/$IMG"
  (cd "$CACHE" && grep " $IMG\$" SHA512SUMS.debian12 | sha512sum -c -)
else
  echo "Already downloaded and verified."
fi

echo "== Cloud-init user-data ($SNIP_STORE:snippets/$NAME-user.yaml)"
cat > "$SNIP_DIR/$NAME-user.yaml" <<YAML
#cloud-config
hostname: $NAME
manage_etc_hosts: true
timezone: $(cat /etc/timezone 2>/dev/null || echo UTC)
users:
  - name: $USERNAME
    groups: [sudo]
    shell: /bin/bash
    sudo: "ALL=(ALL) NOPASSWD:ALL"
    lock_passwd: true
    ssh_authorized_keys:
      - $KEY
disable_root: true
ssh_pwauth: false
package_update: true
package_upgrade: true
packages: [git, qemu-guest-agent]
runcmd:
  - [systemctl, enable, --now, qemu-guest-agent]
  - [git, clone, --branch, "$BRANCH", "$REPO", /opt/forge-src]
  - LAN_CIDR=$LAN_CIDR ADMIN_USER=$USERNAME bash /opt/forge-src/server/provision.sh && touch /var/lib/forge-provisioned
final_message: "Forge provisioning finished after \$UPTIME seconds"
YAML

echo "== Creating the VM"
qm create "$VMID" --name "$NAME" --ostype l26 --cores "$CORES" --memory "$MEM" --cpu x86-64-v2-AES \
  --scsihw virtio-scsi-single --scsi0 "$STORAGE:0,import-from=$CACHE/$IMG,discard=on,iothread=1,ssd=1" \
  --ide2 "$STORAGE:cloudinit" --boot order=scsi0 --serial0 socket --vga serial0 \
  --net0 "virtio,bridge=$BRIDGE,firewall=1" --ipconfig0 ip=dhcp \
  --cicustom "user=$SNIP_STORE:snippets/$NAME-user.yaml" \
  --agent enabled=1 --onboot 1 \
  --description "Forge server (PocketBase). Built by server/create-vm.sh from elibolton/forge."
qm disk resize "$VMID" scsi0 "$DISK"
qm start "$VMID"

provisioned() {
  qm guest exec "$VMID" -- test -f /var/lib/forge-provisioned 2>/dev/null \
    | python3 -c 'import json,sys; sys.exit(json.load(sys.stdin).get("exitcode",1))' 2>/dev/null
}

echo "== Waiting for the VM to boot and provision (about 3–6 minutes)"
ip=""
for i in $(seq 1 120); do
  if out=$(qm guest cmd "$VMID" network-get-interfaces 2>/dev/null); then
    ip=$(printf '%s' "$out" | python3 -c '
import json,sys
for i in json.load(sys.stdin):
    if i.get("name")=="lo": continue
    for a in i.get("ip-addresses",[]):
        if a.get("ip-address-type")=="ipv4": print(a["ip-address"]); raise SystemExit')
    [ -n "$ip" ] && provisioned && break
  fi
  sleep 5
done

health=$( [ -n "$ip" ] && qm guest exec "$VMID" -- curl -fsS http://127.0.0.1:8090/api/health 2>/dev/null | python3 -c 'import json,sys; print(json.load(sys.stdin).get("out-data","").strip())' || true)
echo
if printf '%s' "$health" | grep -q healthy; then
  echo "Done. VM $VMID '$NAME' is at $ip and PocketBase is healthy."
else
  echo "VM $VMID started${ip:+ at $ip}, but provisioning hasn't reported done yet."
  echo "Watch it with: qm terminal $VMID   (or the VM's Console), then: sudo cloud-init status --long"
fi
echo "From your Mac:   ssh $USERNAME@${ip:-<vm-ip>}"
echo "Next: the admin account and ./funnel.sh (server/README.md)."
