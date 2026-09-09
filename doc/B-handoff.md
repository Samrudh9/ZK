# B-Side Handoff — Frontend Visual Redesign (Round 2)

> From A (**Samrudh**), to **B (Sathwik)**. Baseline: **`main` @ `ee22129`** (PR #4 merged; local `main` == `origin/main`).
> You (Sathwik) own the **frontend visual redesign**. You may touch **only `frontend/`**.
>
> **The API contract is FROZEN** (see `doc/teammate-handoff.md` §4). Do not change
> any call, payload, route, or storage key. If you think something must change,
> talk to A first — the backend will not move to match you.
>
> Do **not** modify `backend/`, `circuits/`, `chaincode/`, or the router/auth-guard
> logic if you don't need to. If a change there becomes unavoidable, flag it to A.

---

## Current state (what already works, do not break)

The app already integrates with the live backend on the frozen contract:
- **Login** (`/auth/login` `{userId,password}`) — stores `token`, `role` (lowercase),
  `username` in localStorage; role routes to `/patient` or `/provider`.
- **PatientDashboard** — consent create + list + select, proof generate
  (`{providerId, recordCategories, consentPolicyId, expiry}`), copy share
  `{proofId, proof, publicSignals}`.
- **ProviderDashboard** — paste full proof JSON, POST `/proof/verify`, render
  `accessGranted`/`authorizedCategories`/`txId`/`auditRef`; handles
  `PROOF_REPLAYED` / `INVALID_PROOF` / `PROOF_EXPIRED` / `POLICY_INACTIVE`.
- **api.js** — `/v1` proxy → `:3001`; 401 interceptor clears token/role/username
  and redirects to `/login`.
- **Routing** via `ProtectedRoute`: `/login`, `/patient`, `/provider`.

`doc/guide.md` has the same list in combined form — treat this file as **the
authoritative B instruction**.

---

## B — FULL TASK LIST (Sathwik)

### B1. Design system (foundation — do this FIRST)
- `frontend/tailwind.config.js`: **replace the cyan/purple glassmorphism** theme
  (glow blobs, `from-cyan-500 to-purple-500`) with a professional clinical palette:
  deep navy/slate base, a single trustworthy medical accent, semantic status colors.
- `frontend/src/index.css`: real typography hierarchy (display face + Inter body),
  a defined spacing scale; remove `animate-fade-in` / gradient-blob template tells.
- Introduce reusable theme tokens/classes (surface, border, alert states) instead
  of ad-hoc Tailwind strings repeated in every file.

### B2. Shared UI components (`frontend/src/components/ui/`)
Add, reuse everywhere, all theme-consistent and labelled:
- `Badge` — status: ACTIVE / REVOKED / EXPIRED / ACCESS_GRANTED / REPLAYED.
- `Toast` — success / error / notice.
- `EmptyState` — icon + title + helper + action.
- `Loading` / `Spinner`.
- `Field` — label + input/select/textarea wrapper with error text.
- `StatCard`, `Modal`/`Confirm`, `ResultPanel`.
Refactor existing `Button` / `Card` to the new theme.

### B3. Pages
- **Landing page** (`/`): real product hero (zero-knowledge proofs, patient
  consent, replay protection) + CTA to login. Currently `/` auto-redirects to
  `/login` — add a route; keep login reachable.
- **Login** (`/login`): cleaner clinic-branded form; KEEP the patient/provider
  demo-account quick-switcher (useful for the demo); clearer validation/errors.
- **PatientDashboard**: consent policies list with status badges; add-policy form;
  proof generation with a clear "bound to policy X" explainer; **share-proof**
  flow (Copy JSON + JSON preview); honest empty/loading/error + toast states.
- **ProviderDashboard**: paste-proof verify with real validation/hint; rich
  ACCESS GRANTED result (authorized categories as chips, tx/audit refs); replay
  and error states styled distinctly.

### B4. Copy pass
Remove template-y strings — "Sign In Securely", "Verify Cryptographic Proof",
"premium feel", empty-state filler. Write copy that reads like a real clinical
product (EHR + consent + zero-knowledge consent verification), not a demo scaffold.

---

## B5. HARD CONSTRAINTS (do not break)

Keep these **exactly** as-is:

- API calls & payloads:
  - `POST /auth/login` → `{ userId, password }`
  - `GET /consent` ; `POST /consent` → `{ providerId, allowedCategories, validFrom, validUntil, maxAccessCount }`
  - `POST /proof/generate` → `{ providerId, recordCategories, consentPolicyId, expiry }`
  - `POST /proof/verify` → `{ proofId, proof, publicSignals }`
- Routing used by `ProtectedRoute`: `/login`, `/patient`, `/provider` (+ new `/` landing).
- localStorage keys: `token`, `role` (lowercase), `username`.
- `api.js` interceptor behavior: 401 → clear token/role/username → redirect `/login`.
- Do **not** edit `backend/`, `circuits/`, `chaincode/`.
- Do **not** touch `App.jsx` router/auth-guard logic beyond adding the `/` landing route if you need it there (if that conflicts, ask A).

---

## B6. Integrate & merge

1. Branch from latest `main`:
   `git fetch origin && git checkout -b feat/frontend-contract origin/main` (or rebase your existing branch on `cfb8664`).
2. `cd frontend && npm run build` — must pass.
3. Manually verify against the **LIVE backend** (backend must be running on `:3001`;
   if it's down, ping A to bring it up — do NOT run `tools/mock-api/` while the real backend is up):
   - Landing → login patient → create consent → generate proof → copy share JSON.
   - Logout → login provider → paste proof → **ACCESS GRANTED** (categories + txId + auditRef).
   - Paste the same proof again → **PROOF_REPLAYED (409)**.
4. Open a **PR → `main`**, request A for review. Keep the PR scoped to `frontend/` only.

---

## Definition of done (B)
- [ ] B1 design system + B2 shared components done
- [ ] B3 all four pages redesigned + B4 copy pass done
- [ ] `npm run build` green
- [ ] Live patient→provider→replay flow verified against real backend
- [ ] PR merged, scoped to `frontend/`
