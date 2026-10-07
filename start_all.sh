#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
# Start infra
cd "$ROOT/fabric-network"
docker start zk-zh-db >/dev/null 2>&1 || true
docker compose up -d >/dev/null 2>&1
sleep 20
docker start ccaas.accesscontrol >/dev/null 2>&1 || true
sleep 8
# Start backend if not running
if ! pgrep -f "node src/app.js" >/dev/null 2>&1; then
  export PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH"
  cd "$ROOT/backend"
  setsid nohup npm start > /tmp/backend.log 2>&1 < /dev/null &
  disown || true
  sleep 5
fi
curl -s -m 5 http://localhost:3001/health >/dev/null && echo "OK: backend+infra up"
