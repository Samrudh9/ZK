# ZKHealthPass — Team Guide: Remaining Work (Round 2)

> Status baseline (local `main` == `origin/main` @ `cf7c8f9`, PR #4 merged).
> API contract is **frozen** (see `doc/teammate-handoff.md` §4). Neither side changes it.
>
> - **A = backend + infra + verification** (does NOT touch `frontend/`)
> - **B = frontend** — B's full instructions live in **`doc/B-handoff.md`** (authoritative for B).
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

B owns the **frontend visual redesign**. Full, authoritative B instructions are in
**`doc/B-handoff.md`** (B1 design system → B2 shared components → B3 pages → B4 copy
pass → B5 hard constraints → B6 integrate/merge → definition of done). Follow that
file; this guide only tracks the overall round-2 checklist below.

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
