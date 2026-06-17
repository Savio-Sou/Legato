// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import "forge-std/Test.sol";
import {PoseidonT3} from "poseidon-solidity/PoseidonT3.sol";
import {PoseidonT4} from "poseidon-solidity/PoseidonT4.sol";

/// Tri-Poseidon regression vector (Solidity leg) — must match circomlibjs + Noir `poseidon` lib.
/// PoseidonT3.hash = 2 inputs (H_2); PoseidonT4.hash = 3 inputs (H_3).
contract PoseidonVectorTest is Test {
    function test_H2_matches_circomlibjs() public {
        uint256 h = PoseidonT3.hash([uint256(1), uint256(2)]);
        assertEq(h, 0x115cc0f5e7d690413df64c6b9662e9cf2a3617f2743245519e19607a4417189a);
    }

    function test_H3_matches_circomlibjs() public {
        uint256 h = PoseidonT4.hash([uint256(1), uint256(2), uint256(3)]);
        assertEq(h, 0x0e7732d89e6939c0ff03d5e58dab6302f3230e269dc5b968f725df34ab36d732);
    }
}
