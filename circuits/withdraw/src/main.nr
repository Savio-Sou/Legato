use poseidon::poseidon::bn254::hash_1;
use poseidon::poseidon::bn254::hash_2;
use poseidon::poseidon::bn254::hash_3;

// Depth of the on-chain commitment Merkle tree. Must match MerkleTreeWithHistory.LEVELS
// in the Solidity ShieldedPool. (Benchmarked at 16 vs 12 — see derisking.)
global TREE_DEPTH: u32 = 16;

// Partial-withdrawal join-split: spend one input note, pay `public_amount` to `recipient`,
// and re-commit the remainder as a change note (`new_commitment`) owned by the same spender.
//
// Soundness: `public_amount + change_value == value` with both summands range-checked to 64 bits
// (prevents field-wrap value forgery). The nullifier is recipient-INDEPENDENT so the same note
// cannot be double-spent to two recipients. `recipient` is bound into the constraint system via a
// 160-bit range check (it is an address), making the proof non-malleable at the payout target.
fn main(
    // ── public inputs (order is load-bearing: the verifier and ShieldedPool read positionally) ──
    root: pub Field,
    nullifier: pub Field,
    recipient: pub Field,
    public_amount: pub Field,
    new_commitment: pub Field,
    // ── private witness ──
    value: Field,
    blinding: Field,
    sk: Field,
    merkle_path: [Field; TREE_DEPTH],
    path_indices: [bool; TREE_DEPTH],
    change_value: Field,
    change_blinding: Field,
) {
    // Owner pubkey (a hash, not a curve point) and the input-note commitment.
    let pk = hash_1([sk]);
    let commitment = hash_3([value, pk, blinding]);

    // Merkle membership: fold the commitment up to the root.
    let mut current = commitment;
    for i in 0..TREE_DEPTH {
        let is_right = path_indices[i];
        let left = if is_right { merkle_path[i] } else { current };
        let right = if is_right { current } else { merkle_path[i] };
        current = hash_2([left, right]);
    }
    assert(current == root, "Merkle root mismatch");

    // Nullifier — deterministic per note, unforgeable without sk, independent of recipient.
    assert(nullifier == hash_2([sk, commitment]), "Bad nullifier");

    // Value conservation with range checks (the key join-split soundness requirement).
    public_amount.assert_max_bit_size::<64>();
    change_value.assert_max_bit_size::<64>();
    assert(value == public_amount + change_value, "Value not conserved");

    // Change note re-commitment (owned by the spender; full withdrawal ⇒ change_value == 0).
    assert(new_commitment == hash_3([change_value, pk, change_blinding]), "Bad change commitment");

    // Bind the recipient into the constraint system (and validate it is address-sized).
    recipient.assert_max_bit_size::<160>();
}

#[test]
fn test_partial_withdraw() {
    // One real note at leaf 0; sibling leaves are the zero-subtree.
    let value: Field = 5000;
    let blinding: Field = 42;
    let sk: Field = 7;
    let pk = hash_1([sk]);
    let commitment = hash_3([value, pk, blinding]);

    // Build the path for leaf index 0 (always left): siblings are the cached zero nodes.
    let zero_leaf: Field = 0; // contract uses zeros[0] = 0
    let mut zeros: [Field; TREE_DEPTH] = [0; TREE_DEPTH];
    zeros[0] = zero_leaf;
    for i in 1..TREE_DEPTH {
        zeros[i] = hash_2([zeros[i - 1], zeros[i - 1]]);
    }
    // root with our commitment at index 0
    let mut current = commitment;
    for i in 0..TREE_DEPTH {
        current = hash_2([current, zeros[i]]);
    }
    let root = current;

    let public_amount: Field = 2000;
    let change_value: Field = 3000;
    let change_blinding: Field = 99;
    let new_commitment = hash_3([change_value, pk, change_blinding]);
    let nullifier = hash_2([sk, commitment]);
    let recipient: Field = 0x1234567890123456789012345678901234567890;

    main(
        root,
        nullifier,
        recipient,
        public_amount,
        new_commitment,
        value,
        blinding,
        sk,
        zeros,
        [false; TREE_DEPTH],
        change_value,
        change_blinding,
    );
}

#[test]
fn test_full_withdraw_zero_change() {
    let value: Field = 5000;
    let blinding: Field = 42;
    let sk: Field = 7;
    let pk = hash_1([sk]);
    let commitment = hash_3([value, pk, blinding]);

    let mut zeros: [Field; TREE_DEPTH] = [0; TREE_DEPTH];
    for i in 1..TREE_DEPTH {
        zeros[i] = hash_2([zeros[i - 1], zeros[i - 1]]);
    }
    let mut current = commitment;
    for i in 0..TREE_DEPTH {
        current = hash_2([current, zeros[i]]);
    }
    let root = current;

    let change_blinding: Field = 99;
    let new_commitment = hash_3([0, pk, change_blinding]);
    let nullifier = hash_2([sk, commitment]);

    main(
        root,
        nullifier,
        0x1234567890123456789012345678901234567890,
        value, // public_amount == value
        new_commitment,
        value,
        blinding,
        sk,
        zeros,
        [false; TREE_DEPTH],
        0, // change_value
        change_blinding,
    );
}
