# ZKHealthPass — Team Guide: Remaining Work (Round 2)

> Status baseline (local `main` == `origin/main` @ `cf7c8f9`, PR #4 merged).
> API contract is **frozen** (see `doc/teammate-handoff.md` §4). Neither side changes it.
>
> - **A = backend + infra + verification** (does NOT touch `frontend/`)
> - **B = frontend** (does NOT touch `backend/`, `circuits/`, `chaincode/`, `App.jsx` react-router layout)
>
> Branch rule: **A → `main` directly** (docs/logs/reports only). **B → `feat/frontend-contract` → PR to `main`.** No shared file editing.

---

## ✅ Already done (do not redo)

- Backend REST stack works **live end-to-end**: login → consent create → proof generate → provider verify → replay `409` → audit trail.
- 21 backend tests pass (auth, consent, proof routes + proof.service).
- Frontend contract work (B, PR #4): Login, PatientDashboard (consent create + proof gen + copy JSON), ProviderDashboard (paste-proof verify + replay/error states), api.js 401 interceptor.
- 9-week project log (`doc/logs/week-01..09.md`).

---

## A — YOUR FULL REMAINING TASK LIST

A owns backend health, verification, docs, and repo hygiene. **No `frontend/` changes.**

### A1. Backend review report (report-only, per earlier decision)
Produce `doc/backend-review.md` documenting (do NOT fix unless asked):
| # | Location | Finding |
|---|---|---|
| 1 | `backend/src/api/routes/records.routes.js` | `GET /records` returns hardcoded mock; `POST /records/register` uses `patientIdHash:'N/A'` + a fabricated `RECORD_REGISTERED` audit event — leftover scaffolding inconsistent with the real consent/proof flow |
| 2 | `backend/src/services/audit.service.js:getAuditEvent` | calls `QueryConsentPolicy(auditId)` with an audit id — wrong chaincode function; cannot return an audit event |
| 3 | `backend/src/api/routes/auth.routes.js` register | `registerSchema` defaults `orgId:'Org1MSP'` while the route maps `PROVIDER → Org2MSP`; inconsistent/confusing |
| 4 | `doc/status.md` | gitignored + overclaims "100%/Complete"; keep local, note real state in the weekly log instead |

### A2. Keep the live stack healthy for B
- Confirm backend on `:3001` and Vite on `:5173`; `/v1` proxy → `:3001`.
- If the Fabric/Postgres stack is down, bring it back up **before** B does the integration test (see prior runbook: `docker compose up -d` in `fabric-network/`, restart `ccaas.accesscontrol` with chaincode-id `accessControl_1.0:70341a…`).
- Re-run backend suite (`cd backend && npm test`) before and after B merges; keep 21 tests green.

### A3. Verify B's redesign end-to-end (your "yes" to live E2E)
Once B's redesign is merged, drive the full UI flow live and confirm nothing regressed:
1. Landing → login `alice/alicepw` (patient).
2. Create consent policy → generate proof → copy share JSON.
3. Logout → login `drbob/bobpw` (provider).
4. Paste proof JSON → **ACCESS GRANTED** (authorizedCategories, txId, auditRef).
5. Paste the same proof again → **PROOF_REPLAYED (409)**.
6. `cd frontend && npm run build` passes.
Report any backend-side fixes needed back to yourself = do them on `main`.

### A4. Week-10+ weekly log
- Add `doc/logs/week-10.md` (Weekly Project Log Report format):
  - **Completed**: full frontend redesign (by B) + live UI E2E verification.
  - **In Progress**: final demo polish / mentor-demo readiness.
  - **Next**: final demo run + project write-up.
- Continue this pattern weekly.

### A5. Repo hygiene / merge support
- Keep `main` green; ensure CI (backend tests, chaincode tests, frontend build) passes for B's PR.
- Do NOT push to B's branch; help resolve merge conflicts only if asked (A owns integration confidence).

---

## B — YOUR FULL REMAINING TASK LIST

B owns the **frontend visual redesign**. You may touch only `frontend/`. The API contract is frozen — keep every call & payload the same.

### B1. Design system (foundation first)
- `frontend/tailwind.config.js`: replace the **cyan/purple glassmorphism** theme with a professional clinical palette (deep navy/slate base + a single trustworthy medical accent + semantic status colors). Remove glowing gradient blobs.
- `frontend/src/index.css`: real typography hierarchy (display face + Inter body), spacing scale, remove `animate-fade-in`-style template tells.
- Introduce reusable theme tokens/classes (surface, border, alert states) instead of ad-hoc Tailwind strings in every file.

### B2. Shared UI components (`frontend/src/components/ui/`)
Add and reuse (all theme-consistent, all labelled/accessible):
- `Badge` (status: ACTIVE/REVOKED/EXPIRED etc.)
- `Toast` (success / error / notice)
- `EmptyState` (icon + title + helper + action)
- `Loading` / `Spinner`
- `Field` (label + input/select/textarea wrapper with error text)
- `StatCard`, `Modal`/`Confirm`, `ResultPanel`
Refactor existing `Button`/`Card` to the new theme.

### B3. Pages
- **Landing page** (`/`): real product hero (zero-knowledge proofs, patient consent, replay protection), CTA to login. Currently `/` auto-redirects to `/login` — add a route, keep login reachable.
- **Login** (`/login`): cleaner clinic-branded form; keep the patient/provider demo-account quick-switcher (useful for the demo); clearer validation/error presentation.
- **PatientDashboard**: consent policies list with status badges; add-policy form; proof generation with a clear "bound to policy X" explainer; **share-proof** flow (Copy JSON + JSON preview); honest empty/loading/error + toast states.
- **ProviderDashboard**: paste-proof verify with real validation/hint; rich ACCESS GRANTED result (authorized categories as chips, tx/audit refs); replay/error states styled distinctly.

### B4. Copy pass
- Remove template-y strings: "Sign In Securely", "Verify Cryptographic Proof", "premium feel", empty-state filler.
- Ground the "EHR/records" story in the copy so it reads like a real clinical product, not a demo scaffold.

### B5. Hard constraints (do not break)
- Keep exact API calls & payloads:
  - `POST /auth/login` `{ userId, password }`
  - `GET /consent`, `POST /consent` `{ providerId, allowedCategories, validFrom, validUntil, maxAccessCount }`
  - `POST /proof/generate` `{ providerId, recordCategories, consentPolicyId, expiry }`
  - `POST /proof/verify` `{ proofId, proof, publicSignals }`
- Keep routing used by `ProtectedRoute`: `/login`, `/patient`, `/provider` (+ new `/` landing).
- Keep `localStorage` keys: `token`, `role` (lowercase), `username`.
- Keep `frontend/src/services/api.js` interceptor behavior (401 → clear + redirect /login).
- Do not edit `backend/`, `circuits/`, `chaincode/`, or the router/auth guard logic in `App.jsx`.

### B6. Integrate & merge
1. Branch from latest `main`: `git checkout -b feat/frontend-contract` (or your existing one, rebased on `main`).
2. `cd frontend && npm run build` — must pass.
3. Manually verify against the LIVE backend (backend must be running; ask A to ensure it's up): full patient→provider flow.
4. Open a **PR → `main`**, mention A for review. Keep the PR scoped to `frontend/` only.

---

## Coordination / handshake

- **Contract**: frozen in `doc/teammate-handoff.md` §4 — never changed.
- **Friction points to avoid**:
  - A must not edit `frontend/`; B must not edit `backend/` / `doc/` logs.
  - `doc/status.md` is local-only (gitignored) — don't rely on it for the repo.
  - Backend DNS/ports: backend `:3001`, Vite `:5173`, DB `:5433` (do not collide with other work).
- **Definition of done (Round 2)**:
  - [ ] A: `doc/backend-review.md` written
  - [ ] A: backend suite green + live E2E verified after B merge
  - [ ] A: `doc/logs/week-10.md` added
  - [ ] B: design system + shared components done
  - [ ] B: all four pages redesigned + copy pass
  - [ ] B: `npm run build` green + live flow verified + PR merged
  - [ ] Both: final demo runbook rehearsed
