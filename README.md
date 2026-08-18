# ZKHealthPass

Privacy-as-a-Service API platform for healthcare data access control.
Healthcare providers and telemedicine apps access patient EHR references with
**cryptographically verifiable consent** — without ever exposing the patient's
identity or full record contents.

Uses **zk-SNARKs (Groth16)** to prove authorization without revelation, with
**Hyperledger Fabric** as the permissioned, immutable audit ledger.

> **Status:** Phase 2 complete — ZK proof pipeline working. Fabric network and
> API in progress.

---

## How it works

```
┌──────────────┐   POST /proof/generate    ┌──────────────────────────────┐
│   Patient    │ ───────────────────────► │          Backend API         │
│   App        │                          │  Node.js · Express · Zod     │
└──────────────┘                          │                              │
                                          │  Proof Service (snarkjs)     │
┌──────────────┐   POST /proof/verify     │  ┌──────────────────────┐    │
│   Provider   │ ───────────────────────► │  │ access_control.circom│    │
│   App        │                          │  │  Groth16 · Poseidon  │    │
└──────────────┘                          │  └──────────────────────┘    │
                                          └──────────────┬───────────────┘
                                                         │ gRPC (mTLS)
                                          ┌──────────────▼───────────────┐
                                          │   HYPERLEDGER FABRIC 2.5     │
                                          │   Org1 (Patients) · Org2     │
                                          │   (Providers) · CouchDB      │
                                          │   healthchannel · Raft       │
                                          └──────────────────────────────┘
```

1. A patient creates a consent policy (provider, categories, duration, max uses).
2. The patient generates a **zk-SNARK proof** that they own the patient/provider
   identities behind the committed hashes, with the policy bound to the proof.
3. The provider submits the proof **by proofId**; the backend verifies it with
   snarkjs and the chaincode enforces replay/policy/expiry checks on the ledger.
4. Every access event is recorded immutably on Fabric — no raw patient identity
   or EHR content ever touches the platform.

---

## Repo structure

```
circuits/                    ZK circuit sources + trusted setup pipeline
  access_control.circom      access predicate (~1035 constraints, < 2^14 target)
  hash_check.circom          Poseidon(2) preimage check
  build.sh                   compile → ptau → groth16 setup → artifacts
backend/
  src/services/proof.service.js   generateProof / verifyProof / hashIds
  src/circuits/                   compiled artifacts (wasm, zkey, vkey)
  test/proof.test.js              Jest suite (4 tests)
  scripts/demo-proof.js           end-to-end CLI demo
fabric-network/              Phase 1: Fabric 2.5 network (2 orgs × 2 peers,
                             3 Raft orderers, CAs, CouchDB) + scripts
```

---

## Quick start (proof pipeline)

Requires **Node.js ≥ 20** and **circom ≥ 2.1.6** (prebuilt binaries on the
[circom releases page](https://github.com/iden3/circom/releases) — no Rust
needed) and **snarkjs**:

```bash
# 1. Build the circuit + trusted setup (downloads/generates Powers of Tau, ~170 MB)
cd circuits && ./build.sh

# 2. Install backend deps and run the test suite
cd ../backend && npm install && npm test

# 3. See the pipeline in action
node scripts/demo-proof.js
```

### Measured performance (dev machine, power-14 ptau)

| Operation      | Target | Actual   |
|----------------|--------|----------|
| Proof generation | < 8 s | **~0.9 s** |
| Proof verification | < 2 s | **~26 ms** |
| Circuit size   | < 16,384 constraints | **1,035** |

---

## Security model

- **Zero-knowledge:** proofs reveal only committed hashes + policy/expiry/nonce
  — never the underlying identities.
- **Replay protection:** each proofId is marked `CONSUMED` on the ledger.
- **Trust boundary:** snarkjs cannot run inside Fabric chaincode — the backend
  verifies proofs locally (snarkjs); the chaincode authoritatively enforces
  replay, policy, and expiry state on the ledger.
- **Privacy:** no raw PII or EHR content is stored; identity is stored as a
  Poseidon hash only.
- **Trusted setup:** Groth16 requires a Powers of Tau ceremony; `build.sh`
  generates a local one (demo-appropriate) if the public Hermez ptau is
  unreachable.

---

## Roadmap

| Phase | Scope | Status |
|-------|-------|--------|
| 1 | Foundation & Fabric network | 🔄 configs + scripts ready; blocked on Docker/WSL locally |
| 2 | ZK circuit + proof service | ✅ 936 ms proofs, 26 ms verification, 4/4 tests |
| 3 | Chaincode (`accessControl`) | ⬜ |
| 4 | Backend REST API (auth, consent, proof, audit) | ⬜ |
| 5–6 | Patient / Provider / Developer portals | ⬜ |
| 7–9 | E2E integration, benchmarking, demo prep | ⬜ |

---

## License

[MIT](LICENSE) © 2026 Samrudh S Shetty