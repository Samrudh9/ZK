# ZKHealthPass — Frontend Handoff for Teammate B

> **Your job**: fix + finish the React frontend so it talks to the backend REST API correctly.
> **You work alone, no Hyperledger Fabric / PostgreSQL needed** — a mock API server is included so you can build and run the whole UI locally.
> **Do not** touch circuits, chaincode, or backend `src/`. Only the files listed in §6.

---

## 1. TL;DR

| | |
|---|---|
| What you build | A working Patient + Provider dashboard that talks to the real REST API |
| Where to run | Local machine, mock API on `:3001`, Vite dev server on `:5173` |
| Who logs in | `alice` / `alicepw` (**PATIENT**), `drbob` / `bobpw` (**PROVIDER**) |
| What's broken today | The 3 pages call the API with the wrong fields and render the wrong responses (details in §5) |
| Source of truth | The **frozen contract** in §4 — the mock API you run implements exactly this |
| Definition of done | §9 checklist |

---

## 2. What ZKHealthPass is

A zero-knowledge **electronic health record (EHR) access-control** system.

The idea: a patient proves to a provider "I consent to you seeing my Allergy and
Vaccination records" **without revealing any of the underlying medical data**. A
zero-knowledge proof cryptographically guarantees the claim is true; the blockchain
(Hyperledger Fabric) records the *consent policy* and the *audit trail* immutably.

Architecture — three tiers:

```
┌─────────────────────────┐     ┌──────────────────────────────┐
│  Frontend (React + Vite)│────▶│  Backend (Express, REST)     │
│  Patient & Provider     │     │  · /v1/auth  /v1/consent     │
│  dashboards (YOU)       │     │  · /v1/proof /v1/audit       │
└─────────────────────────┘     │  · verifies the zk proof     │
                                └──────────────┬───────────────┘
                                               │ gRPC (fabric-gateway)
                                ┌──────────────▼───────────────┐
                                │  Hyperledger Fabric           │
                                │  chaincode `accessControl`:   │
                                │  consent policies + audit,    │
                                │  replay-proof, expiry checks  │
                                └──────────────────────────────┘
```

The demo flow (this is the story you make work in the browser):

1. Patient `alice` logs in → sees her consent policies → creates a consent policy
   for provider `drbob` covering some record categories (e.g. `Allergy`, `Vaccination`).
2. She generates a **zero-knowledge proof** bound to that policy (this takes
   0.5–2s). The UI shows her a JSON blob: `{ proofId, proof, publicSignals }`.
3. She shares that JSON with the provider (copy/paste — this simulates sending
   the proof out-of-band).
4. Provider `drbob` logs in → pastes the JSON → clicks verify.
5. Backend cryptographically verifies the proof, asks Fabric for the stateful
   checks (proof not reused, policy active, not expired). On success: **ACCESS GRANTED**
   with the authorized categories. If the *same* proof is verified again → **PROOF_REPLAYED** (409).

---

## 3. Repo map (what you need to know)

```
zkhealthpass/                     ← repo root
├── circuits/                     control. WASM/zkey/vkey are copied into backend/src/circuits. DON'T TOUCH.
│   ├── access_control.circom
│   └── …                       
├── chaincode/accessControl/      the Fabric smart contract. DON'T TOUCH.
├── backend/                      Express REST API. DON'T TOUCH src/ or test/.
│   ├── src/api/routes/           the exact endpoints §4 is based on
│   ├── src/services/             proof (snarkjs), fabric gateway, consent, auth
│   └── scripts/e2e-demo.js       CLI end-to-end demo (already proven working live)
├── frontend/                     ★ YOUR WORK LIVES HERE
│   ├── src/
│   │   ├── App.jsx               routing + role guard (reads localStorage 'token','role')
│   │   ├── pages/
│   │   │   ├── Login.jsx             ★ fix
│   │   │   ├── PatientDashboard.jsx  ★ rewrite
│   │   │   └── ProviderDashboard.jsx ★ rewrite
│   │   ├── services/api.js           ★ fix (axios instance)
│   │   └── components/            shared UI (Card, Button, Navbar…) — reuse, don't change
│   └── vite.config.js            proxy: /v1 → http://localhost:3001
└── tools/mock-api/               ★ mock REST server for you (NO Fabric/Postgres needed)
```

Rules:
- **Only touch** `frontend/src/pages/Login.jsx`, `frontend/src/pages/PatientDashboard.jsx`,
  `frontend/src/pages/ProviderDashboard.jsx`, `frontend/src/services/api.js`, and
  `frontend/vite.config.js` (only if needed — the default proxy already works for mock).
- Reuse the existing `components/` (Card, Button, Navbar, layout) so the design stays consistent.
- Keep the existing Tailwind/glassmorphism styling conventions.

---

## 4. The FROZEN API contract (source of truth)

Base URL: `http://localhost:3001/v1` (all paths below are relative to `/v1`).
Authed endpoints need header: `Authorization: Bearer <accessToken>`.
Errors always have this shape:

```json
{ "error": { "code": "…", "message": "…", "statusCode": 401, "requestId": "req_ab12" } }
```

Common error codes you must handle gracefully in the UI:

| Code | HTTP | When |
|---|---|---|
| `UNAUTHORIZED` / `TOKEN_EXPIRED` | 401 | bad/missing/expired token → send user back to login |
| `FORBIDDEN` | 403 | right token, wrong role for the endpoint |
| `POLICY_INACTIVE` | 403 | policy is expired/exhausted/revoked |
| `POLICY_NOT_FOUND` | 404 | policy id doesn't exist |
| `INVALID_PROOF` / `PROOF_EXPIRED` | 400 | proof is bad, or its `expiry` passed |
| `PROOF_REPLAYED` | 409 | **the same proofId was already verified** (replay attack blocked) |
| `USER_EXISTS` | 409 | register with a taken userId |

### AUTH

**`POST /auth/login`** (public)
```jsonc
// request
{ "userId": "alice", "password": "alicepw" }
// 200 response
{ "accessToken": "eyJ…", "refreshToken": "eyJ…", "expiresIn": 3600, "role": "PATIENT" }
```
> Note: field is `userId`, response is `accessToken` (not `token`), role is uppercase.

**`POST /auth/register`** (public) — optional; you may skip registering (mock is pre-seeded).
```jsonc
{ "userId": "carol", "password": "supersecret1", "role": "PATIENT" }   // role: "PATIENT" | "PROVIDER"
// 201 response
{ "walletId": "<uuid>", "message": "User registered successfully" }
```

**`POST /auth/refresh`** (public) — send `{ "refreshToken": "…" }` → same shape as login.

**`DELETE /auth/logout`** (authed) → `{ "message": "Logged out successfully" }`

### CONSENT (all authed, PATIENT role)

**`GET /consent`** → `200` array of consent policies (may be empty). Each policy:
```jsonc
{
  "docType": "consentPolicy",
  "policyId": "cp_9f3a…",          // call it "policyId"
  "policyHash": "7d66…",            // hex commitment
  "patientIdHash": "f1e2…",
  "providerId": "drbob",
  "allowedCategories": ["Allergy", "Vaccination"],
  "purpose": "",
  "validFrom": "2026-09-08T00:00:00.000Z",
  "validUntil": "2027-09-08T00:00:00.000Z",
  "maxAccessCount": 5,
  "accessCount": 0,                  // increments on each granted access
  "status": "ACTIVE",                // ACTIVE | REVOKED | EXPIRED | EXHAUSTED
  "createdAt": "…", "updatedAt": "…"
}
```

**`POST /consent`** → create policy.
```jsonc
// request
{
  "providerId": "drbob",
  "allowedCategories": ["Allergy", "Vaccination"],
  "validFrom": "2026-09-08T00:00:00.000Z",   // ISO-8601
  "validUntil": "2027-09-08T00:00:00.000Z",  // must be after validFrom
  "maxAccessCount": 5,                        // optional
  "purpose": "cardiology follow-up"           // optional
}
// 201 response (note: NOT the full policy — just the summary)
{ "policyId": "cp_9f3a…", "policyHash": "7d66…", "status": "ACTIVE" }
```

**`PUT /consent/:policyId`** (optional) — body: any subset of `{ allowedCategories, validUntil, maxAccessCount, purpose }`.

**`DELETE /consent/:policyId`** → `{ "policyId": "cp_9f3a…", "status": "REVOKED" }`

**`GET /consent/:policyId/access-log`** → `{ "total": 2, "events": [ …auditEvent ] }` (see AUDIT).

### PROOF

**`POST /proof/generate`** (authed, PATIENT).
> IMPORTANT (frozen decision): the **backend derives `patientId` from your login**, so the request body does NOT include a patient id.
```jsonc
// request
{
  "providerId": "drbob",
  "recordCategories": ["Allergy", "Vaccination"],
  "consentPolicyId": "cp_9f3a…",     // the policy this proof is bound to
  "expiry": "2026-09-08T02:00:00.000Z" // ISO datetime, proof valid until then
}
// 200 response
{
  "proofId": "prf_a1b2…",
  "proof": { "pi_a": ["…","…"], "pi_b": [["…","…"],["…","…"]], "pi_c": ["…","…"],
             "protocol": "groth16", "curve": "bn128" },
  "publicSignals": ["1", "<patientIdHash>", "<providerIdHash>", "<policyHashToken>", "<expirySec>", "<nonce>"],
  "generatedAt": "2026-…",
  "expiresAt": "2026-…",
  "durationMs": 812
}
```
> The patient shares this whole object (`proofId` + `proof` + `publicSignals`) with the provider.

**`POST /proof/verify`** (authed, PROVIDER).
```jsonc
// request
{
  "proofId": "prf_a1b2…",
  "proof": { "pi_a": […], "pi_b": [ […],[…] ], "pi_c": […], "protocol": "groth16" },
  "publicSignals": ["1", …]
}
// 200 response
{ "valid": true, "accessGranted": true,
  "authorizedCategories": ["Allergy", "Vaccination"],
  "txId": "tx_ab12…", "auditRef": "aud_cd34…" }
// NOT 200 → replay / invalid / policy inactive errors (see table above)
```
> Verifying the SAME `proofId` a second time must produce **409 `PROOF_REPLAYED`**. The mock does this.

**`GET /proof/:proofId`** (authed) → status of a proof:
```jsonc
{ "proofId": "prf_a1b2…", "status": "GENERATED" }   // or VERIFIED / CONSUMED / UNUSED
```

### AUDIT (authed; PATIENT / PROVIDER / ADMIN)

**`GET /audit?providerId=drbob&action=ACCESS_GRANTED&limit=20`**
Optional query params: `patientIdHash`, `providerId`, `action`, `fromDate`, `toDate`, `limit`.
→ `{ "total": 2, "events": [ … ] }`
```jsonc
{ "docType": "auditEvent", "auditId": "aud_…", "patientIdHash": "…",
  "providerId": "drbob", "category": ["Allergy","Vaccination"], "action": "ACCESS_GRANTED",
  "policyId": "cp_9f3a…", "proofId": "prf_a1b2…", "txId": "tx_…", "timestamp": "…" }
```

`GET /audit/:auditId` → single event.

---

## 5. What's broken today (your starting point)

All three pages were scaffolded against an imaginary API and have mismatched contracts:

| File | Current (broken) | Contract (must become) |
|---|---|---|
| `Login.jsx:23` | POSTs `{ username, password, role }` | POST `{ userId, password }` |
| `Login.jsx:25` | reads `res.data.token` | read `res.data.accessToken` |
| `Login.jsx:29` | routes on `role === 'patient'` | route on `role.toLowerCase()` (backend returns `PATIENT`/`PROVIDER`) |
| `PatientDashboard.jsx:21` | POSTs `{ providerId, categories }` to `/proof/generate` | Need a consent policy first; POST `{ providerId, recordCategories, consentPolicyId, expiry }` (no patientId!) |
| `PatientDashboard.jsx:130` | renders `proof.zkProof` | render/copy `{ proofId, proof, publicSignals }` JSON |
| `ProviderDashboard.jsx:23` | POSTs `{ proofId }` to `/proof/verify` | POST the full `{ proofId, proof, publicSignals }` JSON (paste box) |
| `ProviderDashboard.jsx:97,105` | renders `verificationResult.patientId`, `.data` | render `accessGranted`, `authorizedCategories[]`, `txId`, `auditRef` |

Also: the patient dashboard has **no way to create a consent policy** at all — you must add that (small form) so a proof has something to bind to.

---

## 6. Your tasks (file by file)

### 6.1 `frontend/src/services/api.js` — mostly fine, small hardening

Current:
```js
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
```
Keep this. **Add** a response interceptor: if the response is `401` (expired/invalid
token), clear `localStorage` and redirect to `/login`. (Use `window.location` or a
callback — keep it simple.)

### 6.2 `Login.jsx` — align with contract

> **UPDATE (2026-09-09):** the base contract fix for this page is ALREADY LANDED on
> `main` (correct `{userId, password}` body, stores `accessToken`, routes on
> `role.toLowerCase()`). Before you start, `git pull` into your branch. What's still
> **your** job for the auth layer: the **401 → redirect to login** handling in
> `api.js` (§6.1). If you already wrote this page, diff against `main` to avoid
> conflicts.

Target behavior (reference for the already-landed change):
- Keep the two role buttons (Patient / Provider) but they can just set the demo user+password:
  - Patient → `userId: alice`, `password: alicepw`
  - Provider → `userId: drbob`, `password: bobpw`
- Submit `{ userId, password }` (drop `role` — the backend decides role from the user).
- On success:
  ```js
  localStorage.setItem('token', res.data.accessToken);
  localStorage.setItem('role', res.data.role.toLowerCase());      // 'patient' | 'provider'
  localStorage.setItem('username', userId);
  // navigate: role 'patient' → /patient, else /provider
  ```
- On error: read `err.response?.data?.error?.message` and show it in the existing error box.

Do **not** change `App.jsx` — it already guards `/patient` with role `patient` and `/provider` with role `provider`.

### 6.3 `PatientDashboard.jsx` — add consent creation + real proof gen

Add a **Consent policy section**:
- Reuse the existing "Select Provider" dropdown (`drbob`, `drsmith`) and category checkboxes (`Allergy`, `Vaccination`, `Surgery`).
- Add a "Valid until" date input (default `now + 1 year`, ISO).
- Button **"Create Consent Policy"** → `POST /v1/consent`:
  ```js
  { providerId, allowedCategories: categories,
    validFrom: new Date().toISOString(),
    validUntil: validUntilISO, maxAccessCount: 5 }
  ```
  - On `201`: store `res.data.policyId` in state, show a success chip (`Consent policy cp_… ACTIVE`), and refresh the policy list (`GET /v1/consent`).
- **List existing policies** below (from `GET /v1/consent`): show `status`, `providerId`, `allowedCategories`, `policyId` — let the user **select** which policy to prove against (default = the one just created).

Then **proof generation** (existing button):
- Disable until a `consentPolicyId` is selected.
- `POST /v1/proof/generate`:
  ```js
  { providerId: selectedProvider, recordCategories: categories,
    consentPolicyId: selectedPolicyId,
    expiry: new Date(Date.now() + 3600_000).toISOString() }
  ```
- Render the result panel:
  - green "Proof Generated Successfully" header (keep the design),
  - the `proofId`,
  - a **"Copy share JSON"** button that copies:
    ```js
    JSON.stringify({ proofId: res.data.proofId, proof: res.data.proof, publicSignals: res.data.publicSignals })
    ```
  - optional: show `durationMs` ("Generated in 812 ms") and `expiresAt`.
- Remember: the patient gives this JSON to the provider (this replaces today's
  "only share the proofId" model — the provider needs the full proof to verify).

Acceptance: create policy → generate proof → copy JSON → (switch accounts) provider can verify it.

### 6.4 `ProviderDashboard.jsx` — paste the proof JSON, verify, render result

- Replace the "Enter Proof ID" input with a **textarea** labeled "Paste the proof JSON from the patient" (placeholder shows the expected shape, maybe a small "Paste example" hint).
- On submit:
  ```js
  const data = JSON.parse(pasted);               // try/catch → "Invalid JSON"
  await api.post('/proof/verify', data);          // data = { proofId, proof, publicSignals }
  ```
- Render success panel (keep the glassy design):
  - big **green "ACCESS GRANTED"** + `valid`, `accessGranted`
  - list of `authorizedCategories`
  - footer with `txId` and `auditRef`
- **Error handling — this is the money shot for the demo.** When verify fails, show the error banner with:
  - `code` and `message` from `err.response?.data?.error`
  - a distinct, readable state for `PROOF_REPLAYED` ("This proof was already used — replay blocked") vs `INVALID_PROOF` vs `PROOF_EXPIRED`.
  - For `401` → redirect to login.

Acceptance: paste a fresh proof → ACCESS GRANTED; paste the **same** proof again → clear "Proof already used / replay rejected (409)" message.

### 6.5 `vite.config.js` — leave as-is

Proxy already targets `http://localhost:3001`, which is exactly where the mock runs.
(On integration day your partner runs the real backend on the same port — no change needed.)

---

## 7. Fresh-machine setup (do this once)

1. **Install Node.js 18+** (LTS 20 recommended):
   - Linux/macOS via `nvm` or your package manager;
   - Windows via https://nodejs.org (v20 LTS installer).
   Verify: `node -v` → `v20.x`, `npm -v` → `10.x`.
2. **Install git** and clone:
   ```bash
   git clone https://github.com/Samrudh9/ZK.git
   cd ZK
   git checkout main
   ```
   (You'll be added as a collaborator; you work on branch `feat/frontend-contract`.)
3. **Frontend deps:**
   ```bash
   cd frontend
   npm install
   ```
4. **Mock API deps + run:**
   ```bash
   cd ../tools/mock-api
   npm install
   npm start          # serves the API on http://localhost:3001
   ```
   (Terminal 1 — leave this running.)
5. **Frontend dev server:**
   ```bash
   cd ../frontend
   npm run dev        # http://localhost:5173
   ```
   (Terminal 2.)
6. Open **http://localhost:5173**, log in as `alice` / `alicepw` (Patient).

If the app can't reach the API, first check the mock server logs are printing requests.

---

## 8. Demo script (run through before you're done)

1. Login as **alice / alicepw** (Patient dashboard).
2. Create consent policy: provider `drbob`, categories `Allergy` + `Vaccination`, valid until +1y.
   → success chip shows `policyId`, policy appears in the list with status `ACTIVE`.
3. Click **"Generate ZK Proof"** (policy selected, same provider/categories).
   → result panel shows `proofId`, duration, expires; **copy the share JSON**.
4. Log out, log in as **drbob / bobpw** (Provider dashboard).
5. Paste the JSON; click verify.
   → **ACCESS GRANTED**, authorized categories listed, `txId` + `auditRef` shown.
6. Paste the **same JSON again**; click verify.
   → error banner: **PROOF_REPLAYED** "proof already used — replay blocked".
7. Provider audits: `GET /audit?providerId=drbob` (mental check) → you should see
   `CONSENT_CREATED` and `ACCESS_GRANTED` entries with the audit timestamps.

---

## 9. Definition of done

- [ ] `npm run dev` starts clean, no console errors
- [ ] Branch `feat/frontend-contract`, every commit focused, pushed to GitHub
- [ ] Login works for both demo users and routes to the right dashboard
- [ ] Patient can create a consent policy and see it listed
- [ ] Patient can generate a proof bound to that policy and copy the `{proofId,proof,publicSignals}` JSON
- [ ] Provider can paste that JSON and verify → ACCESS GRANTED with categories
- [ ] Re-verifying the same proofId shows a clear **replay-rejected** state
- [ ] `401` responses kick back to login; `403` role guards work (e.g. provider hitting `/consent`)
- [ ] No changes to rows in `frontend/src/App.jsx`, `components/`, circuits, chaincode, or `backend/`
- [ ] Do NOT merge to `main` yourself — open a PR titled `feat: frontend contract alignment` so A can review

---

## 10. Notes for your partner (A) — read this, not your problem

- Chaincode **enforces MSP per operation**: `CreateConsentPolicy`/`Update`/`Revoke`
  require `Org1MSP`; `VerifyAndGrantAccess` requires `Org2MSP`
  (`chaincode/accessControl/lib/accessControl.js:58,230`).
  → The REST backend CANNOT keep one identity.
- ✅ **DONE (A)**: the real backend now loads **both** Org1 and Org2 identities
  (`backend/src/services/fabric.service.js` routes each chaincode call to the org
  that may invoke it). The **real REST stack is verified end-to-end against a live
  Fabric network**: login → consent create → proof generate → provider verify
  (`accessGranted:true`) → replay (`409 PROOF_REPLAYED`) → on-chain audit trail.
  The backend implements the §4 contract exactly (patientId from JWT, 6 public
  signals, `{valid,accessGranted,authorizedCategories,txId,auditRef}`).
- The mock runs beside the real app. On integration day, A's real backend replaces
  the mock on the same port — your frontend must work without any contract changes.
- If A changes the contract while you build, the mock (and this doc) will be updated
  in `main` — pull latest + `git pull` often.
