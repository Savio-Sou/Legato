// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import {PoseidonT3} from "poseidon-solidity/PoseidonT3.sol";

/// @notice Tornado-style fixed-depth incremental Merkle tree with a rolling history of recent roots.
///         2-to-1 node hashing uses Poseidon (PoseidonT3.hash), byte-identical to the Noir `withdraw`
///         circuit (poseidon::bn254::hash_2) and the circomlibjs tree the frontend rebuilds from
///         `NewCommitment` events. Empty leaves are ZERO_VALUE = 0.
///
///         A history of the last ROOT_HISTORY_SIZE roots is kept so an in-flight withdrawal (whose
///         proof was built against a slightly older root) still verifies after other deposits have
///         advanced the tree.
contract MerkleTreeWithHistory {
    uint256 public constant ZERO_VALUE = 0;
    uint32 public constant ROOT_HISTORY_SIZE = 30;

    uint32 public immutable levels;

    mapping(uint256 => bytes32) public filledSubtrees; // level => last filled left node
    mapping(uint256 => bytes32) public roots; // ring buffer of recent roots
    uint32 public currentRootIndex;
    uint32 public nextIndex;

    // _zeros[i] = root of an all-ZERO_VALUE subtree of height i (precomputed once).
    bytes32[33] private _zeros;

    constructor(uint32 _levels) {
        require(_levels > 0 && _levels < 32, "bad levels");
        levels = _levels;

        bytes32 z = bytes32(ZERO_VALUE);
        _zeros[0] = z;
        for (uint32 i = 0; i < _levels; i++) {
            filledSubtrees[i] = z;
            z = hashLeftRight(z, z);
            _zeros[i + 1] = z;
        }
        // initial root = root of the fully empty tree
        roots[0] = z;
    }

    /// @notice Poseidon 2-to-1 hash of a tree node's children.
    function hashLeftRight(bytes32 left, bytes32 right) public pure returns (bytes32) {
        return bytes32(PoseidonT3.hash([uint256(left), uint256(right)]));
    }

    /// @notice Root of an all-zero subtree of height `i` (i in [0, levels]).
    function zeros(uint32 i) public view returns (bytes32) {
        return _zeros[i];
    }

    /// @notice Insert a leaf, recompute the root, and push it into the history ring buffer.
    function _insert(bytes32 leaf) internal returns (uint32 index) {
        uint32 _nextIndex = nextIndex;
        require(_nextIndex != uint32(2) ** levels, "tree full");
        uint32 currentIndex = _nextIndex;
        bytes32 currentLevelHash = leaf;
        bytes32 left;
        bytes32 right;
        for (uint32 i = 0; i < levels; i++) {
            if (currentIndex % 2 == 0) {
                left = currentLevelHash;
                right = _zeros[i];
                filledSubtrees[i] = currentLevelHash;
            } else {
                left = filledSubtrees[i];
                right = currentLevelHash;
            }
            currentLevelHash = hashLeftRight(left, right);
            currentIndex /= 2;
        }
        uint32 newRootIndex = (currentRootIndex + 1) % ROOT_HISTORY_SIZE;
        currentRootIndex = newRootIndex;
        roots[newRootIndex] = currentLevelHash;
        nextIndex = _nextIndex + 1;
        return _nextIndex;
    }

    /// @notice Whether `root` is one of the last ROOT_HISTORY_SIZE roots.
    function isKnownRoot(bytes32 root) public view returns (bool) {
        if (root == 0) return false;
        uint32 _currentRootIndex = currentRootIndex;
        uint32 i = _currentRootIndex;
        do {
            if (root == roots[i]) return true;
            if (i == 0) i = ROOT_HISTORY_SIZE;
            i--;
        } while (i != _currentRootIndex);
        return false;
    }

    function getLastRoot() public view returns (bytes32) {
        return roots[currentRootIndex];
    }
}
