#!/usr/bin/env bash
# Runs the access-rule and invite tests against a throwaway PocketBase in Docker.
#   server/tests/run.sh
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd); SERVER=$(dirname "$HERE")
PB_VERSION=${PB_VERSION:-$(grep -m1 '^PB_VERSION=' "$SERVER/provision.sh" | sed -E 's/.*:-([0-9.]+).*/\1/')}
PORT=${PORT:-18091}
NAME=forge-pb-test-$$

cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker run -d --name "$NAME" -p "127.0.0.1:$PORT:8090" -v "$SERVER:/srv:ro" debian:12 bash -c "
  set -e
  apt-get update -qq >/dev/null && apt-get install -y -qq curl ca-certificates unzip >/dev/null
  arch=\$(dpkg --print-architecture); v=$PB_VERSION
  base=https://github.com/pocketbase/pocketbase/releases/download/v\$v; zip=pocketbase_\${v}_linux_\${arch}.zip
  cd /tmp && curl -fsSL -o \$zip \$base/\$zip && curl -fsSL -o sums \$base/checksums.txt
  grep \" \$zip\\\$\" sums | sha256sum -c - >/dev/null && unzip -q \$zip pocketbase
  ./pocketbase superuser upsert admin@test.local testpassword123 --dir=/tmp/pb_data >/dev/null
  exec ./pocketbase serve --http=0.0.0.0:8090 --dir=/tmp/pb_data --hooksDir=/srv/pb_hooks --migrationsDir=/srv/pb_migrations
" >/dev/null

printf 'Starting PocketBase %s' "$PB_VERSION"
for i in $(seq 1 90); do
  curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1 && break
  printf .; sleep 1
done; echo
curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null || { docker logs "$NAME" | tail -30; exit 1; }

PB_URL="http://127.0.0.1:$PORT" node --test "$HERE/rules.test.mjs"
