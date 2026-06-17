// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import "forge-std/Test.sol";
import {ShieldedPool} from "../src/ShieldedPool.sol";

/// @dev Verifier that always returns true — isolates contract logic (tree, nullifiers, transfers)
///      from ZK soundness, which is tested at the circuit level (`nargo test`) and end-to-end.
contract AlwaysTrueVerifier {
    function verify(bytes calldata, bytes32[] calldata) external pure returns (bool) {
        return true;
    }
}

contract AlwaysFalseVerifier {
    function verify(bytes calldata, bytes32[] calldata) external pure returns (bool) {
        return false;
    }
}

/// @dev Minimal ERC-20 mock for pathUSD (6-decimals semantics; decimals irrelevant to logic).
contract MockPathUSD {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "insufficient");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "insufficient");
        require(allowance[from][msg.sender] >= amount, "not approved");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract ShieldedPoolTest is Test {
    AlwaysTrueVerifier verifier;
    MockPathUSD token;
    ShieldedPool pool;

    address employer = address(0xA11CE);
    address employee = address(0xB0B);

    uint32 constant LEVELS = 16;

    function setUp() public {
        verifier = new AlwaysTrueVerifier();
        token = new MockPathUSD();
        pool = new ShieldedPool(address(verifier), address(verifier), address(token), LEVELS);
    }

    // ── helpers ───────────────────────────────────────────────────────────────
    function _depositInputs(uint256 value, bytes32 commitment)
        internal
        pure
        returns (bytes32[] memory pi)
    {
        pi = new bytes32[](2);
        pi[0] = bytes32(value);
        pi[1] = commitment;
    }

    function _withdrawInputs(
        bytes32 root,
        bytes32 nullifier,
        address recipient,
        uint256 amount,
        bytes32 newCommitment
    ) internal pure returns (bytes32[] memory pi) {
        pi = new bytes32[](5);
        pi[0] = root;
        pi[1] = nullifier;
        pi[2] = bytes32(uint256(uint160(recipient)));
        pi[3] = bytes32(amount);
        pi[4] = newCommitment;
    }

    function _deposit(uint256 value, bytes32 commitment) internal {
        token.mint(employer, value);
        vm.startPrank(employer);
        token.approve(address(pool), value);
        pool.deposit("", _depositInputs(value, commitment), "", "", bytes32(0));
        vm.stopPrank();
    }

    // ── key registry ────────────────────────────────────────────────────────────
    function test_registerKey() public {
        vm.prank(employee);
        pool.registerKey(111, 222, 333);
        (uint256 pk, uint256 ex, uint256 ey, bool reg) = pool.keys(employee);
        assertEq(pk, 111);
        assertEq(ex, 222);
        assertEq(ey, 333);
        assertTrue(reg);
    }

    function test_registerKey_double_reverts() public {
        vm.startPrank(employee);
        pool.registerKey(1, 2, 3);
        vm.expectRevert(ShieldedPool.AlreadyRegistered.selector);
        pool.registerKey(4, 5, 6);
        vm.stopPrank();
    }

    // ── deposit ──────────────────────────────────────────────────────────────────
    function test_deposit_pulls_value_and_inserts() public {
        bytes32 commitment = bytes32(uint256(0xC0FFEE));
        bytes32 rootBefore = pool.getLastRoot();

        _deposit(5000e6, commitment);

        assertEq(token.balanceOf(address(pool)), 5000e6, "pool funded");
        assertEq(token.balanceOf(employer), 0, "employer drained");
        assertEq(pool.nextIndex(), 1, "leaf inserted");
        assertTrue(pool.getLastRoot() != rootBefore, "root advanced");
        assertTrue(pool.isKnownRoot(pool.getLastRoot()), "new root known");
    }

    function test_deposit_wrong_length_reverts() public {
        bytes32[] memory pi = new bytes32[](3);
        vm.prank(employer);
        vm.expectRevert(ShieldedPool.InvalidInputsLength.selector);
        pool.deposit("", pi, "", "", bytes32(0));
    }

    function test_deposit_invalid_proof_reverts() public {
        ShieldedPool badPool =
            new ShieldedPool(address(new AlwaysFalseVerifier()), address(verifier), address(token), LEVELS);
        vm.prank(employer);
        vm.expectRevert(ShieldedPool.InvalidProof.selector);
        badPool.deposit("", _depositInputs(1e6, bytes32(uint256(1))), "", "", bytes32(0));
    }

    // ── withdraw ─────────────────────────────────────────────────────────────────
    function test_withdraw_pays_and_marks_nullifier() public {
        _deposit(5000e6, bytes32(uint256(0xC0FFEE)));
        bytes32 root = pool.getLastRoot();
        bytes32 nf = bytes32(uint256(0x1111));
        bytes32 change = bytes32(uint256(0xCC));

        // partial withdrawal of 2000 to the employee
        pool.withdraw("", _withdrawInputs(root, nf, employee, 2000e6, change), "", "", bytes32(0));

        assertEq(token.balanceOf(employee), 2000e6, "employee paid");
        assertEq(token.balanceOf(address(pool)), 3000e6, "remainder retained");
        assertTrue(pool.isSpent(nf), "nullifier marked");
        assertEq(pool.nextIndex(), 2, "change note inserted");
    }

    function test_withdraw_double_spend_reverts() public {
        _deposit(5000e6, bytes32(uint256(0xC0FFEE)));
        bytes32 root = pool.getLastRoot();
        bytes32 nf = bytes32(uint256(0x1111));

        pool.withdraw("", _withdrawInputs(root, nf, employee, 1000e6, bytes32(uint256(1))), "", "", bytes32(0));

        // reuse the same nullifier (root is still known) → must revert
        bytes32 root2 = pool.getLastRoot();
        vm.expectRevert(ShieldedPool.NullifierAlreadySpent.selector);
        pool.withdraw("", _withdrawInputs(root2, nf, employee, 1000e6, bytes32(uint256(2))), "", "", bytes32(0));
    }

    function test_withdraw_unknown_root_reverts() public {
        _deposit(5000e6, bytes32(uint256(0xC0FFEE)));
        vm.expectRevert(ShieldedPool.UnknownRoot.selector);
        pool.withdraw(
            "",
            _withdrawInputs(bytes32(uint256(0xDEAD)), bytes32(uint256(1)), employee, 1e6, bytes32(uint256(2))),
            "",
            "",
            bytes32(0)
        );
    }

    function test_withdraw_wrong_length_reverts() public {
        bytes32[] memory pi = new bytes32[](4);
        vm.expectRevert(ShieldedPool.InvalidInputsLength.selector);
        pool.withdraw("", pi, "", "", bytes32(0));
    }

    // ── root history ─────────────────────────────────────────────────────────────
    function test_old_root_known_within_window() public {
        _deposit(1e6, bytes32(uint256(0x1)));
        bytes32 oldRoot = pool.getLastRoot();
        // advance the tree with several more deposits (< ROOT_HISTORY_SIZE)
        for (uint256 i = 2; i < 10; i++) {
            _deposit(1e6, bytes32(i));
        }
        assertTrue(pool.isKnownRoot(oldRoot), "old root still in history window");
    }
}
