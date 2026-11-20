#!/usr/bin/env bash
# Make or list Forge invite codes, on the VM.
#   sudo /opt/pocketbase/invite.sh                 one code, 1 use, valid 14 days
#   sudo /opt/pocketbase/invite.sh 5 30 "gym friends"   5 uses, 30 days, with a note
#   sudo /opt/pocketbase/invite.sh list
set -euo pipefail
DB=/var/lib/pocketbase/pb_data/data.db
q() { sqlite3 -cmd ".timeout 5000" "$DB" "$@"; }

if [ "${1:-}" = list ]; then
  q -header -column "select code, uses || '/' || maxUses as used, substr(expiresAt,1,10) as expires, note from invites order by created desc;"
  exit 0
fi

uses=${1:-1}; days=${2:-14}; note=${3:-}
case "$uses$days" in *[!0-9]*) echo "Usage: invite.sh [uses] [days] [note] | list"; exit 1;; esac

# 8 characters from an alphabet without look-alikes (no 0/O, 1/I/L).
alphabet=ABCDEFGHJKMNPQRSTUVWXYZ23456789
part() { local s=""; for _ in 1 2 3 4; do s+=${alphabet:$(( $(od -An -N2 -tu2 /dev/urandom) % ${#alphabet} )):1}; done; printf %s "$s"; }
code="$(part)-$(part)"
id=$(od -An -N8 -tx1 /dev/urandom | tr -d ' \n' | cut -c1-15)   # PocketBase ids: 15 chars of [a-z0-9]
expires=$(date -u -d "+$days days" '+%Y-%m-%d %H:%M:%S.000Z')
now=$(date -u '+%Y-%m-%d %H:%M:%S.000Z')
note_sql=${note//\'/\'\'}

q "insert into invites (id, code, maxUses, uses, expiresAt, note, created) values ('$id', '$code', $uses, 0, '$expires', '$note_sql', '$now');"
echo "Invite code: $code   ($uses use$([ "$uses" = 1 ] || echo s), expires ${expires:0:10})"
