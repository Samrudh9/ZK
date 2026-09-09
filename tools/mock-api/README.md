# ZKHealthPass Mock API

In-memory mock of the backend REST API for **frontend development only** (no
Hyperledger Fabric, no PostgreSQL). It implements the frozen contract in
`doc/teammate-b-handoff.md` §4 exactly, so the React frontend can be built and
run locally. It is **not** a substitute for the real backend.

## Run

```bash
npm install
npm start        # http://localhost:3001
```

Keep it running in one terminal; in another:

```bash
cd ../frontend
npm install
npm run dev      # http://localhost:5173
```

The Vite dev server proxies `/v1` → `http://localhost:3001`, so no config
changes are needed.

## Demo users (pre-seeded)

| userId | password | role     |
|--------|----------|----------|
| alice  | alicepw  | PATIENT  |
| drbob  | bobpw    | PROVIDER |

A consent policy (`cp_seed1234567890`, alice → drbob, ACTIVE) is pre-seeded so
you can click straight through the demo. All state resets on restart.

## Quick smoke test (curl)

```bash
# login
curl -s -X POST localhost:3001/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"userId":"alice","password":"alicepw"}'

# generate a proof (needs the accessToken from above)
TOKEN=PASTE_ACCESS_TOKEN_HERE
curl -s -X POST localhost:3001/v1/proof/generate \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"providerId":"drbob","recordCategories":["Allergy"],"consentPolicyId":"cp_seed1234567890","expiry":"2026-09-08T23:00:00.000Z"}'
```

## Notes

- The mock produces a realistic-looking (but not cryptographically valid)
  Groth16 proof and does not run snarkjs — it only needs to look right in the UI.
- `VerifyAndGrantAccess`-style replay protection is simulated: verifying the same
  `proofId` twice returns `409 PROOF_REPLAYED`.
- On integration day your partner starts the real backend on the same port; the
  frontend needs **zero contract changes**.