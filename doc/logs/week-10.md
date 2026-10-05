# Weekly Project Log Report

## Week: 10

### Task Completed
- Teammate B's **frontend contract work merged** (PR #4): Login, PatientDashboard (consent create + proof generate + share JSON), ProviderDashboard (paste-proof verify + replay/error states), api.js 401 interceptor — all aligned to the frozen API contract.
- Confirmed the frontend and live backend integrate on the frozen contract (routes, payloads, routing, localStorage keys match; Vite `/v1` proxy → `:3001`).
- Created a **team guide** (`doc/guide.md`) dividing remaining Round-2 work: **A = backend report + live verification + weekly log**; **B = frontend visual redesign**.
- Started the **back-end review report** (`doc/backend-review.md`): documented demo-scaffolding in `/records`, the `getAuditEvent` wrong-chaincode-function bug, and the register org-mapping inconsistency (report-only, per team decision).
- **Frontend visual redesign merged** (PR #5): professional clinical UI, shared UI components, Landing page, redesigned Patient/Provider dashboards. `npm run build` passes.
- **Live UI E2E verified** (post-redesign, via Vite proxy): login → consent ACTIVE → proof generate → provider verify (accessGranted true, authorizedCategories) → replay **409 PROOF_REPLAYED** — all contract behaviors preserved.

### Task in Progress
- **Frontend visual redesign (B)**: replacing the generic cyan/purple glassmorphism with a professional clinical design system, shared UI components, a landing page, and redesigned patient/provider dashboards.
- **Backend review report (A)** being finalised; live-stack kept healthy for B's integration test.

### Task to Begin Next Week
- B: complete redesign (design system → components → pages → copy pass) → `npm run build` → open PR → merge.
- A: verify B's redesign end-to-end against the live backend + Fabric (login → consent → proof → grant → replay 409); keep 21 backend tests green; decide/act on backend-review findings (esp. `getAuditEvent` bug).
- Both: rehearse the final mentor/demo runbook.

### Follow-up (same week): post-reset stack recovery
- Environment reset took down all containers; full stack restored (Postgres `:5433`, Fabric 4 peers/3 orderers/CAs/CouchDBs, backend `:3001`).
- Re-aligned chaincode packages: re-installed/approved/committed `accessControl` **1.2 at sequence 6** so every peer shares one package-id (the CCaaS server must run that exact id).
- Fixed `No index exists for this sort` failures: the CCaaS packaging pipeline strips `META-INF`, and couchdb containers have no named volume, so a compose rebuild wiped all state-DB indexes. Added **`fabric-network/scripts/setup-couchdb-indexes.sh`** which re-deploys the chaincode's 4 index definitions (auditByPatient/auditByTimestamp/policyByCreated/policyByPatient) into all four peer CouchDBs.
- Verified live E2E incl. the sorted audit-trial query (previously failing): login → consent ACTIVE → proof grant → replay 409 → audit-by-id + `?action=` filter both return events. Backend 21/21, chaincode 43/43 tests green.
