# Weekly Project Log Report

## Week: 4

### Task Completed
- **ZK Circuit + Proof Service** (Phase 2): designed and compiled `access_control.circom`.
- Used **Poseidon hashes** for efficient zero-knowledge proofs, proving knowledge of a `patientId` and `providerId` behind committed hashes while binding `policyHash`, `expiry`, and `nonce` as public inputs.
- Completed the **trusted setup** (Powers of Tau) for Groth16.
- Integrated **snarkjs** for proof generation (< 1s) and verification (< 100ms).
- Deployed the circuit artifacts (wasm, zkey, verification key) into the backend circuit directory.

### Task in Progress
- Tuning proof generation/verification performance and validating the committed public signals against the on-chain policy commitment.

### Task to Begin Next Week
- Begin the **Chaincode (Smart Contracts)** phase: design and implement the Node.js `accessControl` chaincode.
