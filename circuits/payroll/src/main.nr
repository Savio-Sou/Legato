use std::hash::pedersen_hash;

// Proves that hash(employee_address, salary_amount) is a leaf in a Merkle tree
// whose root is `root`. The Merkle path and indices are kept private.
fn main(
    root: pub Field,
    employee_address: pub Field,
    salary_amount: pub Field,
    merkle_path: [Field; 3],
    path_indices: [bool; 3],
) {
    let leaf = pedersen_hash([employee_address, salary_amount]);

    let mut current = leaf;
    for i in 0..3 {
        let is_right = path_indices[i];
        let left  = if is_right { merkle_path[i] } else { current };
        let right = if is_right { current } else { merkle_path[i] };
        current = pedersen_hash([left, right]);
    }

    assert(current == root, "Merkle root mismatch");
}

#[test]
fn test_merkle_membership() {
    // Leaf for address=1, salary=1000
    let addr: Field = 1;
    let salary: Field = 1000;
    let leaf = pedersen_hash([addr, salary]);

    // Build a depth-3 tree with one real leaf; all others are zero-padded
    let zero: Field = 0;
    let zero_leaf = pedersen_hash([zero, zero]);

    // Level 1 (pairs of leaves)
    let n01 = pedersen_hash([leaf, zero_leaf]);
    let n23 = pedersen_hash([zero_leaf, zero_leaf]);
    let n45 = pedersen_hash([zero_leaf, zero_leaf]);
    let n67 = pedersen_hash([zero_leaf, zero_leaf]);

    // Level 2
    let n0123 = pedersen_hash([n01, n23]);
    let n4567 = pedersen_hash([n45, n67]);

    // Root
    let computed_root = pedersen_hash([n0123, n4567]);

    // Path for leaf at index 0 (always on the left at every level)
    let merkle_path: [Field; 3] = [zero_leaf, n23, n4567];
    let path_indices: [bool; 3] = [false, false, false];

    main(computed_root, addr, salary, merkle_path, path_indices);
}
