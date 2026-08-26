# ZKHealthPass — CCE Major Project

**A Zero-Knowledge Proof-Based Framework for Privacy-Preserving Electronic
Health Record Access Control on Hyperledger Fabric**

*Major Project, Department of Computer Science & Engineering, NMAMIT — 2025–26*

---

## Abstract

Healthcare organizations routinely share patient data with insurers,
specialists, labs, and telemedicine platforms, yet existing access-control
mechanisms over-expose records, bypass the patient, and produce audit logs the
patient cannot meaningfully audit. This project proposes **ZKHealthPass**, a
framework in which access to electronic health records (EHRs) is granted only
through **zero-knowledge succinct non-interactive arguments of knowledge
(zk-SNARKs)**.

A patient issues a consent policy that is recorded immutably on a
**Hyperledger Fabric** ledger; a zk-SNARK proof — generated over a custom
circom circuit — demonstrates authorization *without revealing the patient's
identity or the record contents*. Proofs are single-use (replay-protected),
expiry-bound, and every access event is written to an immutable audit trail.
The system never stores raw patient identity or EHR content.

---

## 1. Problem Statement

Existing EHR access-control mechanisms fail in one or more of the following ways:

1. **Over-exposure** — a full record is shared when only a subset of fields is needed.
2. **Patient bypass** — access control is enforced by the hospital's IT system,
   not by a mechanism the patient controls or can audit.
3. **Weak auditability** — audit logs are mutable and institution-controlled;
   the patient has no practical way to verify who accessed what, and when.
4. **Compliance gap** — regulations such as India's DPDP Act (2023) require
   explicit, purpose-specific, granular consent; most systems are not designed for it.

## 2. Objectives

1. Design a zero-knowledge circuit that proves authorization for a given
   consent policy without revealing the underlying identities.
2. Enforce access control on a permissioned blockchain (Hyperledger Fabric)
   so that no party can grant access without a valid proof.
3. Provide replay attack prevention, proof expiry, and an immutable audit trail.
4. Quantify proof-generation and verification performance against
   feasibility targets for interactive use (< 8 s generation, < 2 s verification).

## 3. Proposed Methodology

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

**Flow.** (1) A patient creates a consent policy — provider, allowed record
categories, validity window, maximum access count — recorded on the Fabric
ledger. (2) The patient generates a Groth16 proof that they know the identities
behind two committed Poseidon hashes, with the policy hash, expiry, and a nonce
bound to the proof. (3) A provider submits the proof **by proofId**; the backend
verifies it with snarkjs, and the chaincode enforces replay, policy, and expiry
checks on the ledger. (4) Every access event is emitted as a chaincode event and
recorded immutably.

**Trust boundary.** snarkjs cannot execute inside Fabric chaincode; therefore
cryptographic verification is performed by the backend, while the chaincode
authoritatively enforces the *stateful* checks (replay, policy status, expiry,
access-count limits) on the ledger.

## 4. Implementation

| Layer | Choice | Rationale |
|-------|--------|-----------|
| ZK circuits | circom 2.2.3 · Poseidon | Poseidon costs ~240 constraints per 2-input hash vs ~20,000 for SHA-256 |
| Proof system | Groth16 (snarkjs 0.7.6) | ~200-byte proofs; fastest verification; most mature JS support |
| Blockchain | Hyperledger Fabric 2.5 (2 orgs × 2 peers, 3 Raft orderers, CouchDB) | Permissioned, identity-controlled, no gas fees |
| Backend | Node.js 20 · Express (planned) | snarkjs is JS-native; single-language stack |
| Trusted setup | Powers of Tau (power 14), local ceremony | Demo-appropriate; see §6 |

### Repo structure

```
circuits/                     ZK circuit sources + trusted setup pipeline
  access_control.circom       access predicate (1,035 constraints)
  hash_check.circom           Poseidon(2) preimage check
  build.sh                    compile → ptau → groth16 setup → artifacts
backend/
  src/services/proof.service.js    generateProof / verifyProof / hashIds
  src/circuits/                    compiled artifacts (wasm, zkey, vkey)
  test/proof.test.js               Jest suite (4 tests)
  scripts/demo-proof.js            end-to-end CLI demonstration
fabric-network/               Fabric 2.5 network configs + bootstrap scripts
```

## 5. Experimental Evaluation

**Test environment.** Windows 11, Node.js 22, circom 2.2.3, snarkjs 0.7.6,
Powers of Tau (power 14). Single-run figures from `npm test` / `demo-proof.js`.

| Metric | Target | Measured |
|--------|--------|----------|
| Circuit constraint count | < 16,384 (2¹⁴) | **1,035** |
| Proof generation time | < 8 s | **936 ms** (Jest) / 2,380 ms (CLI, first-run WASM init) |
| Proof verification time | < 2 s | **26 ms** (Jest) / 64 ms (CLI) |
| Proof size | — | **722 bytes** |

**Test outcomes (Jest, 4/4 passing):** valid inputs produce proofs that verify;
tampering with any public signal causes verification to fail; wrong private
inputs cannot produce a proof; distinct nonces yield distinct proofs with
stable identity hashes.

## 6. Security Considerations and Limitations

- **Replay protection.** Each proofId is marked `CONSUMED` on the ledger;
  resubmission is rejected (`PROOF_REPLAYED`).
- **Zero-knowledge guarantee.** Public signals are
  `[valid, patientIdHash, providerIdHash, policyHash, expiry, nonce]` — raw
  identities never leave the prover.
- **No raw data storage.** Only Poseidon hashes of identities are stored.
- **Trusted setup.** Groth16 assumes an honest setup; the public Hermez ptau
  was unreachable from the test network, so a local ceremony was used. This is
  acceptable for demonstration and can be replaced by the public transcript
  for production.
- **Trust boundary (above).** The backend, not the chaincode, performs
  cryptographic verification; a compromised backend could, in principle,
  submit arbitrary claims. Stateful checks remain ledger-enforced.

## 7. Future Work

- Chaincode implementation and backend REST API (consent, proof, audit).
- Patient / provider / developer web portals.
- End-to-end performance benchmarking under load (50+ concurrent verifications)
  and comparison against baseline systems from the literature.
- Formal verification of circuit constraints; migration to a public ptau.
- FHIR-aligned record formats and EHR system adapters.

## 8. Reproduction

Requires Node.js ≥ 20, circom ≥ 2.1.6 (prebuilt binaries available on the
[circom releases page](https://github.com/iden3/circom/releases)), snarkjs.

```bash
# 1. Build the circuit + trusted setup (downloads or generates ptau, ~170 MB)
cd circuits && ./build.sh

# 2. Backend deps and test suite
cd ../backend && npm install && npm test

# 3. End-to-end pipeline demo (generate → verify → tamper-reject)
node scripts/demo-proof.js
```

---

## License

[MIT](LICENSE) © 2026 Samrudh S Shetty

*Project guide: Mr. CHIDANANDA T · Department of Computer Science & Engineering, NMAM Institute of Technology*
