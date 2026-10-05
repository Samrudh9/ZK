#!/usr/bin/env bash
#
# setup-couchdb-indexes.sh
#
# Deploy the chaincode's CouchDB indexes into every peer's state database.
#
# WHY THIS EXISTS
# ---------------
# The accessControl chaincode uses rich queries (QueryAuditTrail, QueryPoliciesByPatient)
# that sort on `timestamp` / `createdAt`. CouchDB refuses a sorted rich query without a
# matching JSON index ("No index exists for this sort"). The canonical way to ship these
# indexes is inside the chaincode package (META-INF/statedb/couchdb/indexes) — but the
# CCaaS packaging pipeline intentionally strips META-INF (tar directory-entry quirk), so
# the indexes are deployed here against CouchDB directly.
#
# The definitions below are the single source of truth: the same JSON files live at
#   chaincode/accessControl/META-INF/statedb/couchdb/indexes/*.json
# and are shared with the chaincode repository (tests assert the definitions exist).
#
# USAGE
# -----
#   ./setup-couchdb-indexes.sh
#
# Idempotent: re-running simply re-asserts the same index definitions.
set -euo pipefail

NETWORK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INDEX_DIR="${INDEX_DIR:-${NETWORK_DIR}/../chaincode/accessControl/META-INF/statedb/couchdb/indexes}"

COUCHDB_USER="${COUCHDB_USER:-admin}"
COUCHDB_PASSWORD="${COUCHDB_PASSWORD:-adminpw}"

# Peer CouchDB endpoints (host ports published by docker-compose).
#   5984 -> couchdb0 (peer0.org1)  6984 -> couchdb1 (peer1.org1)
#   7984 -> couchdb2 (peer0.org2)  8984 -> couchdb3 (peer1.org2)
COUCHDB_PORTS=(5984 6984 7984 8984)

# State database for channel `healthchannel` / chaincode `accessControl`.
# Fabric escapes '$' in the chaincode name when creating the CouchDB database.
STATE_DB="healthchannel_access\$control"
STATE_DB_URLENCODED="healthchannel_access%24control"

deploy_indexes() {
  local port="$1"
  local base="http://${COUCHDB_USER}:${COUCHDB_PASSWORD}@localhost:${port}"

  # Make sure the DB exists (peers create it lazily on first invocation).
  if ! curl -sf "${base}/${STATE_DB_URLENCODED}/_index" >/dev/null 2>&1; then
    curl -sf -X PUT "${base}/${STATE_DB_URLENCODED}" >/dev/null 2>&1 || true
  fi

  for idx in "${INDEX_DIR}"/*.json; do
    local name
    name="$(basename "${idx}" .json)"
    echo "  [couchdb:${port}] ${name}"
    curl -sf -X POST \
      -H "Content-Type: application/json" \
      -d "@${idx}" \
      "${base}/${STATE_DB_URLENCODED}/_index" >/dev/null
  done
}

echo "==> Deploying chaincode CouchDB indexes to all peer state databases"
if [ ! -d "${INDEX_DIR}" ]; then
  echo "ERROR: index definitions not found at ${INDEX_DIR}"
  exit 1
fi

for port in "${COUCHDB_PORTS[@]}"; do
  echo "==> [${port}]"
  deploy_indexes "${port}"
done

echo "==> Done. Indexes deployed to ${#COUCHDB_PORTS[@]} CouchDB instances."