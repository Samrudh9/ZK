# Backend Review Report — ZKHealthPass

> Scope: A-side review of the backend (`backend/`). **Report only** — findings are
> documented here for decision; no code changes made in this pass.
> Baseline: `main` @ `cf7c8f9` (backend works live end-to-end; 21 tests green).

---

## Summary

The core backend is functional and verified: dual-identity Fabric gateway,
contract-aligned proof flow, replay → `409`, live audit trail, 21 passing tests.
The items below are **quality / correctness gaps**, not blockers. They fall into
three buckets: (1) leftover demo scaffolding, (2) two real logic bugs in
lower-traffic paths, (3) documentation accuracy.

---

## Findings

### F1 — `records.routes.js` is demo scaffolding, inconsistent with the real flow
- `GET /records` returns a **hardcoded mock list**
  (`rec_1`/`rec_2`, categories `CARDIOLOGY`/`GENERAL`) — the "EHR database" is imaginary.
- `POST /records/register` writes a fabricated audit event with
  `patientIdHash: 'N/A'` and a made-up `RECORD_REGISTERED` action — this is not a
  real patient/proof-bound event and pollutes the audit trail.
- **Impact:** if the demo/narrative spins "provider reads patient records", this
  route fakes it. It does not match the ZK consent→proof story.
- **Options:** (a) remove `/records`; (b) ground it in a real off-chain EHR store
  keyed by category AFTER a verified access; (c) leave as an explicitly-labelled
  mock. Not blocking.

### F2 — `audit.service.js getAuditEvent` queries the wrong chaincode function (real bug)
- `getAuditEvent(auditId)` calls `fabric.evaluateTransaction('QueryConsentPolicy', auditId)`.
- `QueryConsentPolicy` expects a **policy id**, not an **audit id** — so it can never
  return an audit event (`docType === 'auditEvent'` is unreachable via this path).
  The enrichment branch and fallback mask this, returning stale/empty data.
- **Fix (when actioned):** query the ledger for the audit doc by `auditId`
  (there is an on-chain audit store; the correct read should target that
  document type) before enrichment.

### F3 — `auth.routes.js` register org mapping inconsistency (minor)
- `registerSchema` defaults `orgId: 'Org1MSP'` (zod default), but the route
  overrides it: `const orgId = data.role === 'PROVIDER' ? 'Org2MSP' : 'Org1MSP';`.
- The schema default is misleading/dead. **Fix:** drop the schema default or
  remove the redundant override; document the intended mapping (PATIENT→Org1MSP,
  PROVIDER→Org2MSP).

### F4 — Documentation accuracy
- `doc/status.md` is **gitignored** (local-only) and still claims
  "100% / Complete" while the visual redesign and final demo remain open.
- Recommend: keep `status.md` local (as currently configured) and track real
  progress in the weekly logs (`doc/logs/week-NN.md`) + `doc/guide.md`.
- README/`status.md` otherwise reflect the verified backend work.

---

## Verified-good (no action)
- Dual-identity Fabric gateway (`fabric.service.js`) — per-org MSP routing correct.
- Proof route: JWT patientId, full `policyHash` field-token binding, stored-signal
  gate, provider authorization, replay `409` via gRPC detail unwrapping.
- Error handler maps chaincode detail messages (`PROOF_REPLAYED`, `POLICY_INACTIVE`,
  `POLICY_NOT_FOUND`, `PROOF_EXPIRED`) to correct HTTP codes.
- Circuit artifact paths are CWD-independent; vkey read via `fs`.
- Route contract tests (`auth`, `consent`, `proof`) + `proof.service` suite: 21 green.

---

## Recommended priority (if/when actioned)
1. **F2** (real bug — fix next backend pass).
2. **F3** (1-line clarity fix).
3. **F1** (decide: remove, ground, or relabel the mock).
4. **F4** (docs — ongoing via logs/guide; status.md stays local).
