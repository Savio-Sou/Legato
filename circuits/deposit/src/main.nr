use poseidon::poseidon::bn254::hash_3;

// Deposit soundness proof: binds the PUBLIC deposited `value` (the pathUSD the contract pulls in)
// to the hidden-owner commitment that gets inserted into the shared pool. Without this, a malicious
// employer could insert a commitment to more value than they funded and drain other employers'
// deposits. `pk` and `blinding` stay private so the deposit does not reveal which employee is paid.
fn main(value: pub Field, commitment: pub Field, pk: Field, blinding: Field) {
    value.assert_max_bit_size::<64>();
    assert(commitment == hash_3([value, pk, blinding]), "Commitment does not commit value");
}

#[test]
fn test_deposit_binds_value() {
    let value: Field = 4200;
    let pk: Field = 123;
    let blinding: Field = 456;
    let commitment = hash_3([value, pk, blinding]);
    main(value, commitment, pk, blinding);
}

#[test(should_fail_with = "Commitment does not commit value")]
fn test_deposit_rejects_overcommit() {
    let pk: Field = 123;
    let blinding: Field = 456;
    // Commit to 9999 but claim a public value of 1.
    let commitment = hash_3([9999, pk, blinding]);
    main(1, commitment, pk, blinding);
}
