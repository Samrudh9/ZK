# Backend Review Report — ZKHealthPass

> Scope: A-side review of the backend (`backend/`). Findings below have been
> **resolved** in this pass (Round 2, commit post-`dba1bfd`): F1–F3 fixed,
> chaincode upgraded to **v1.2 (sequence 6)**, and E2E re-verified live.
> Baseline: `main` @ `dba1bfd`.

---

## Summary

The core backend is functional and verified: dual-identity Fabric gateway,
contract-aligned proof flow, replay → `409`, live audit trail, and tests.
**Round 2 action taken:** the items below are now fixed (see **Resolution**
under each), chaincode upgraded to **v1.2 (sequence 6)**, and the full backend
suite (21) + chaincode suite (43) pass. Live REST E2E re-verified: login →
consent create → proof generate → provider verify → replay `409` →
`GET /audit/:auditId` returns the real on-chain event.

---

## Findings (now resolved)

### F1 — `records.routes.js` demo scaffolding (RESOLVED: removed)
- `GET /records` returned a hardcoded mock list; `POST /records/register`
  wrote a fabricated audit event with `patientIdHash: 'N/A'`.
- Not in the frozen contract, unused by the frontend, and it polluted the audit
  trail. **Action:** deleted `records.routes.js` and its `/records` mount in
  `backend/src/app.js`.

### F2 — `audit.service.js getAuditEvent` wrong chaincode function (RESOLVED)
- Previously called `fabric.evaluateTransaction('QueryConsentPolicy', auditId)`
  with an audit id — semantically wrong (sets an audit id where a policy id is
  expected) and could never yield the audit document.
- **Action:** added `GetAuditEvent(ctx, auditId)` to the chaincode (raw-key
  read of the audit doc) + 2 unit tests; `audit.service.js` now calls
  `GetAuditEvent`. Verified live: `GET /v1/audit/:auditId` returns the real
  `ACCESS_GRANTED` event.
- **Bonus fix found during E2E:** the contract generated timestamps with
  `new Date().toISOString()` inside the chaincode — non-deterministic across
  endorsers under the multi-org endorsement policy
  (`AND(Org1MSP, Org2MSP)` decoded), causing `ProposalResponsePayloads do not
  match`. Replaced all internal timestamps with `ctx.stub.getTxTimestamp()`
  (identical across endorsers). Chaincode now **v1.2 / sequence 6** (bumped 4 →
  6 across two re-packages after environment resets).

### F3 — `auth.routes.js` register org mapping inconsistency (RESOLVED)
- `registerSchema` had a dead `orgId: z.string().default('Org1MSP')` that the
  route always overwrote (PROVIDER → Org2MSP). Misleading.
- **Action:** removed `orgId` from the schema. Role→org mapping is now the
  single source of truth. Verified live: register + login of a new PATIENT work
  without sending `orgId`.

### F4 — Documentation accuracy
- `doc/status.md` is gitignored (local-only). Progress is tracked in the
  weekly logs + `doc/guide.md` + this report; status.md remains local.

---

## Verified-good (no action)
- Dual-identity Fabric gateway (`fabric.service.js`) — per-org MSP routing correct.
- Proof route: JWT patientId, full `policyHash` field-token binding, stored-signal
  gate, provider authorization, replay `409` via gRPC detail unwrapping.
- Error handler maps chaincode detail messages to correct HTTP codes.
- Circuit artifact paths are CWD-independent; vkey read via `fs`.
- Route contract tests (`auth`, `consent`, `proof`) + `proof.service` suite: 21 green.
- Chaincode suite (`accessControl` + `consentManager`): 43 green.

---

## Round-2 verification summary (live, this pass)
- `accessControl` chaincode upgraded 1.0 → **1.2 (sequence 6)**, both orgs approved.
- Backend :3001 (nodemon), Postgres :5433 (zk-zh-db), all 4 peers + orderers up, CouchDB indexes deployed via `scripts/setup-couchdb-indexes.sh`.
- Live E2E: consent create ACTIVE → proof generate (6 signals) → provider verify
  `accessGranted: true` (LAB, RADIOLOGY) → replay **409 PROOF_REPLAYED** →
  `GET /v1/audit/:auditId` returns `ACCESS_GRANTED`; fresh register (no orgId) logs in.
