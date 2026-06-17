use poseidon::poseidon::bn254::hash_2;
use poseidon::poseidon::bn254::hash_3;

fn main() {}

// Tri-Poseidon regression vector (Noir leg) — must match circomlibjs + poseidon-solidity.
#[test]
fn test_h2_matches_circomlibjs() {
    let h = hash_2([1, 2]);
    assert(h == 0x115cc0f5e7d690413df64c6b9662e9cf2a3617f2743245519e19607a4417189a);
}

#[test]
fn test_h3_matches_circomlibjs() {
    let h = hash_3([1, 2, 3]);
    assert(h == 0x0e7732d89e6939c0ff03d5e58dab6302f3230e269dc5b968f725df34ab36d732);
}
