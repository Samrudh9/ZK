# Weekly Project Log Report

## Week: 7

### Task Completed
- Added a **live E2E demo script** (`backend/scripts/e2e-demo.js`) running against a real Hyperledger Fabric 2.5 network:
  - patient (Org1) issues a consent policy on the ledger;
  - provider (Org2) presents a real zk-SNARK proof → access granted;
  - replay attempt is rejected;
  - immutable audit trail is queryable.
- Fixed E2E issues: **endorsement** handling, **Uint8Array** decoding, and **CouchDB index** bootstrapping for rich queries.
- Hardened the demo: **verify the proof off-chain before any on-chain write**, and bind the proof to the real on-chain policy by committing the full policy hash.

### Task in Progress
- Finalising the E2E demo so the on-chain committed `policyHash` matches the circuit's committed public signal exactly (`assertBoundSignal`).

### Task to Begin Next Week
- **Contract freeze** for teammate B: document the frozen REST API contract and ship a **mock API** so frontend development can proceed independently.
