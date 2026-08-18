pragma circom 2.1.6;

include "node_modules/circomlib/circuits/poseidon.circom";

// ZKHealthPass — constrains `secret` to be the preimage of `expected`
// under Poseidon(2). ~240 constraints per instance.
//
// Poseidon is used instead of SHA-256: SHA-256 needs ~20,000 constraints
// in-circuit; Poseidon needs ~240 for a 2-input hash (techstack.md).
template HashCheck() {
    signal input secret;
    signal input expected;
    signal output match;

    component hasher = Poseidon(2);
    hasher.inputs[0] <== secret;
    hasher.inputs[1] <== 0;

    expected === hasher.out;
    match <== 1;
}