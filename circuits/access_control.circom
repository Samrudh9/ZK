pragma circom 2.1.6;

include "hash_check.circom";

// ZKHealthPass — access-control predicate (Groth16, target < 2^14 constraints)
//
// Proves, without revealing anything:
//   - knowledge of a patientId that hashes to the committed patientIdHash
//   - knowledge of a providerId that hashes to the committed providerIdHash
//   - and binds policyHash, expiry, nonce to the proof as public inputs
//
// Semantic checks (policy ACTIVE / not expired / not replayed) happen at
// verification time in the backend (snarkjs) and chaincode — the circuit
// cannot read a clock or the ledger (see backend.md trust boundary note).
//
// Public signals (order matters, matches backend.md):
//   [valid, patientIdHash, providerIdHash, policyHash, expiry, nonce]
template AccessControl() {
    // ── Public inputs (committed by the proof) ──
    signal input patientIdHash;
    signal input providerIdHash;
    signal input policyHash;
    signal input expiry;
    signal input nonce;

    // ── Private inputs (witness — never revealed) ──
    signal input patientId;
    signal input providerId;

    signal output valid;

    // 1. The prover knows the patientId behind the committed hash
    component patientCheck = HashCheck();
    patientCheck.secret <== patientId;
    patientCheck.expected <== patientIdHash;

    // 2. The prover knows the providerId behind the committed hash
    component providerCheck = HashCheck();
    providerCheck.secret <== providerId;
    providerCheck.expected <== providerIdHash;

    // 3. policyHash / expiry / nonce are bound as public inputs;
    //    a different nonce yields a different proof for the same policy.
    valid <== patientCheck.match * providerCheck.match;
}

component main { public [patientIdHash, providerIdHash, policyHash, expiry, nonce] } = AccessControl();