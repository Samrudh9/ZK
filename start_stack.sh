#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/fabric-network"
echo "Starting Postgres..."
docker start zk-zh-db >/dev/null 2>&1 || true
echo "Starting Fabric..."
docker compose up -d >/dev/null 2>&1
echo "Waiting for peers/orderers..."
sleep 20
echo "Starting CCaaS..."
docker start ccaas.accesscontrol >/dev/null 2>&1 || true
sleep 8
echo "Bootstrapped: $(docker logs ccaas.accesscontrol 2>&1 | grep -c 'Bootstrap process completed')"
docker ps --format "{{.Names}}\t{{.Status}}" | grep -E "zk-zh-db|peer|orderer|couch|ccaas" | head -7
