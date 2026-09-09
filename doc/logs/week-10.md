# Weekly Project Log Report

## Week: 10

### Task Completed
- Teammate B's **frontend contract work merged** (PR #4): Login, PatientDashboard (consent create + proof generate + share JSON), ProviderDashboard (paste-proof verify + replay/error states), api.js 401 interceptor — all aligned to the frozen API contract.
- Confirmed the frontend and live backend integrate on the frozen contract (routes, payloads, routing, localStorage keys match; Vite `/v1` proxy → `:3001`).
- Created a **team guide** (`doc/guide.md`) dividing remaining Round-2 work: **A = backend report + live verification + weekly log**; **B = frontend visual redesign**.
- Started the **back-end review report** (`doc/backend-review.md`): documented demo-scaffolding in `/records`, the `getAuditEvent` wrong-chaincode-function bug, and the register org-mapping inconsistency (report-only, per team decision).

### Task in Progress
- **Frontend visual redesign (B)**: replacing the generic cyan/purple glassmorphism with a professional clinical design system, shared UI components, a landing page, and redesigned patient/provider dashboards.
- **Backend review report (A)** being finalised; live-stack kept healthy for B's integration test.

### Task to Begin Next Week
- B: complete redesign (design system → components → pages → copy pass) → `npm run build` → open PR → merge.
- A: verify B's redesign end-to-end against the live backend + Fabric (login → consent → proof → grant → replay 409); keep 21 backend tests green; decide/act on backend-review findings (esp. `getAuditEvent` bug).
- Both: rehearse the final mentor/demo runbook.
