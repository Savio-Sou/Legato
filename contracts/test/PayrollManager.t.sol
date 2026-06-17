// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import "forge-std/Test.sol";
import "../src/PayrollManager.sol";

/// @dev Verifier that always returns true, used for unit-testing contract logic.
contract AlwaysTrueVerifier {
    function verify(bytes calldata, bytes32[] calldata) external pure returns (bool) {
        return true;
    }
}

/// @dev Minimal ERC-20 mock for pathUSD.
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

contract PayrollManagerTest is Test {
    AlwaysTrueVerifier verifier;
    MockPathUSD token;
    PayrollManager payroll;

    address employerA = address(0xA11CE);
    address employerB = address(0xB0553);
    address employeeA = address(0xB0B);
    address employeeB = address(0xCAFE);

    bytes32 constant ROOT_A = bytes32(uint256(0xaaaa));
    bytes32 constant ROOT_B = bytes32(uint256(0xbbbb));

    function setUp() public {
        verifier = new AlwaysTrueVerifier();
        token = new MockPathUSD();
        // No owner wiring needed — the contract is permissionless. Deploy from
        // an arbitrary address to make that explicit.
        payroll = new PayrollManager(address(verifier), address(token));
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    function _createAndFund(address employer, bytes32 root, uint256 amount) internal {
        vm.prank(employer);
        payroll.createPayroll(root);

        if (amount > 0) {
            token.mint(employer, amount);
            vm.startPrank(employer);
            token.approve(address(payroll), amount);
            payroll.fund(root, amount);
            vm.stopPrank();
        }
    }

    function _makeInputs(bytes32 root, address emp, uint256 salary)
        internal
        pure
        returns (bytes32[] memory)
    {
        bytes32[] memory inputs = new bytes32[](3);
        inputs[0] = root;
        inputs[1] = bytes32(uint256(uint160(emp)));
        inputs[2] = bytes32(salary);
        return inputs;
    }

    function _owner(bytes32 root) internal view returns (address owner) {
        (owner,,) = payroll.getPayroll(root);
    }

    function _active(bytes32 root) internal view returns (bool active) {
        (,, active) = payroll.getPayroll(root);
    }

    function _balance(bytes32 root) internal view returns (uint256 balance) {
        (, balance,) = payroll.getPayroll(root);
    }

    // ── Payroll creation (permissionless, keyed by root) ───────────────────────

    function test_createPayroll_permissionless() public {
        // An arbitrary address that did not deploy the contract can create a payroll.
        address randomEmployer = address(0x1234);
        vm.prank(randomEmployer);
        payroll.createPayroll(ROOT_A);

        assertEq(_owner(ROOT_A), randomEmployer);
        assertTrue(_active(ROOT_A));
    }

    function test_createPayroll_namespacedPerRoot() public {
        vm.prank(employerA);
        payroll.createPayroll(ROOT_A);
        vm.prank(employerB);
        payroll.createPayroll(ROOT_B);

        assertEq(_owner(ROOT_A), employerA);
        assertEq(_owner(ROOT_B), employerB);
        // A root nobody created is inactive.
        assertFalse(_active(bytes32(uint256(0xDEAD))));
    }

    function test_createPayroll_rejectsZeroRoot() public {
        vm.prank(employerA);
        vm.expectRevert(PayrollManager.ZeroRoot.selector);
        payroll.createPayroll(bytes32(0));
    }

    function test_createPayroll_emitsEvent() public {
        vm.prank(employerA);
        vm.expectEmit(true, true, false, false);
        emit PayrollManager.PayrollCreated(employerA, ROOT_A);
        payroll.createPayroll(ROOT_A);
    }

    /// The same root cannot be created twice — even by its original owner.
    function test_createPayroll_duplicateRoot_reverts() public {
        vm.prank(employerA);
        payroll.createPayroll(ROOT_A);

        // Same owner re-creating the same root.
        vm.prank(employerA);
        vm.expectRevert(PayrollManager.PayrollExists.selector);
        payroll.createPayroll(ROOT_A);

        // A different employer cannot hijack an existing root either.
        vm.prank(employerB);
        vm.expectRevert(PayrollManager.PayrollExists.selector);
        payroll.createPayroll(ROOT_A);

        // Ownership is unchanged.
        assertEq(_owner(ROOT_A), employerA);
    }

    /// The whole point of keying by root: one employer can run several payrolls.
    function test_sameEmployer_multiplePayrolls() public {
        vm.startPrank(employerA);
        payroll.createPayroll(ROOT_A);
        payroll.createPayroll(ROOT_B);
        vm.stopPrank();

        assertTrue(_active(ROOT_A));
        assertTrue(_active(ROOT_B));
        assertEq(_owner(ROOT_A), employerA);
        assertEq(_owner(ROOT_B), employerA);
    }

    // ── Funding ────────────────────────────────────────────────────────────────

    function test_fund_creditsPayroll() public {
        _createAndFund(employerA, ROOT_A, 1000e18);
        assertEq(_balance(ROOT_A), 1000e18);
        assertEq(token.balanceOf(address(payroll)), 1000e18);
    }

    /// Only the payroll's owner may fund it.
    function test_fund_reverts_notOwner() public {
        vm.prank(employerA);
        payroll.createPayroll(ROOT_A);

        vm.prank(employerB);
        vm.expectRevert(PayrollManager.NotOwner.selector);
        payroll.fund(ROOT_A, 100e18);
    }

    function test_createAndFund_setsOwnerActiveAndBalance() public {
        uint256 amount = 1000e18;
        token.mint(employerA, amount);

        vm.startPrank(employerA);
        token.approve(address(payroll), amount);
        payroll.createAndFund(ROOT_A, amount);
        vm.stopPrank();

        assertEq(_owner(ROOT_A), employerA);
        assertTrue(_active(ROOT_A));
        assertEq(_balance(ROOT_A), amount);
        assertEq(token.balanceOf(address(payroll)), amount);
    }

    function test_createAndFund_emitsBothEvents() public {
        uint256 amount = 250e18;
        token.mint(employerA, amount);

        vm.startPrank(employerA);
        token.approve(address(payroll), amount);
        vm.expectEmit(true, true, false, false);
        emit PayrollManager.PayrollCreated(employerA, ROOT_A);
        vm.expectEmit(true, false, false, true);
        emit PayrollManager.Funded(ROOT_A, amount);
        payroll.createAndFund(ROOT_A, amount);
        vm.stopPrank();
    }

    function test_createAndFund_rejectsZeroRoot() public {
        vm.prank(employerA);
        vm.expectRevert(PayrollManager.ZeroRoot.selector);
        payroll.createAndFund(bytes32(0), 100e18);
    }

    // ── Claim ────────────────────────────────────────────────────────────────

    function test_claim_success() public {
        uint256 salary = 500e18;
        _createAndFund(employerA, ROOT_A, salary);

        bytes32[] memory inputs = _makeInputs(ROOT_A, employeeA, salary);
        vm.prank(employeeA);
        payroll.claim(hex"", inputs);

        assertTrue(payroll.hasClaimed(ROOT_A, employeeA));
        assertEq(token.balanceOf(employeeA), salary);
        assertEq(_balance(ROOT_A), 0);
    }

    function test_claim_reverts_if_not_active() public {
        // ROOT_B was never created.
        bytes32[] memory inputs = _makeInputs(ROOT_B, employeeB, 100e18);
        vm.prank(employeeB);
        vm.expectRevert(PayrollManager.PayrollNotActive.selector);
        payroll.claim(hex"", inputs);
    }

    function test_claim_reverts_caller_mismatch() public {
        _createAndFund(employerA, ROOT_A, 100e18);
        bytes32[] memory inputs = _makeInputs(ROOT_A, address(0xDEAD), 100e18);
        vm.prank(employeeA);
        vm.expectRevert(PayrollManager.CallerMismatch.selector);
        payroll.claim(hex"", inputs);
    }

    function test_claim_reverts_double_claim() public {
        uint256 salary = 100e18;
        _createAndFund(employerA, ROOT_A, salary * 2); // fund for two claims
        bytes32[] memory inputs = _makeInputs(ROOT_A, employeeA, salary);

        vm.startPrank(employeeA);
        payroll.claim(hex"", inputs);
        vm.expectRevert(PayrollManager.AlreadyClaimed.selector);
        payroll.claim(hex"", inputs);
        vm.stopPrank();
    }

    function test_claim_reverts_invalid_inputs_length() public {
        _createAndFund(employerA, ROOT_A, 100e18);
        bytes32[] memory inputs = new bytes32[](2); // wrong length
        vm.prank(employeeA);
        vm.expectRevert(PayrollManager.InvalidInputsLength.selector);
        payroll.claim(hex"", inputs);
    }

    function test_claim_reverts_insufficient_funds() public {
        _createAndFund(employerA, ROOT_A, 0); // active but unfunded
        bytes32[] memory inputs = _makeInputs(ROOT_A, employeeA, 100e18);
        vm.prank(employeeA);
        vm.expectRevert(PayrollManager.InsufficientFunds.selector);
        payroll.claim(hex"", inputs);
    }

    // ── Fund isolation (the core multi-tenant invariant) ───────────────────────

    /// An employee of an UNDERFUNDED payroll cannot drain another payroll's
    /// funds, even though the contract physically holds them.
    function test_funds_isolated_across_payrolls() public {
        // ROOT_A funded 1000; ROOT_B active but funds nothing.
        _createAndFund(employerA, ROOT_A, 1000e18);
        _createAndFund(employerB, ROOT_B, 0);

        // The contract holds A's 1000 pathUSD.
        assertEq(token.balanceOf(address(payroll)), 1000e18);

        // employeeB has a valid proof for B's tree but B has 0 balance.
        bytes32[] memory inputs = _makeInputs(ROOT_B, employeeB, 50e18);
        vm.prank(employeeB);
        vm.expectRevert(PayrollManager.InsufficientFunds.selector);
        payroll.claim(hex"", inputs);

        // A's funds are untouched.
        assertEq(_balance(ROOT_A), 1000e18);
        assertEq(token.balanceOf(address(payroll)), 1000e18);
    }

    /// Two funded payrolls pay their own employees out of their own balances.
    function test_two_payrolls_pay_independently() public {
        _createAndFund(employerA, ROOT_A, 300e18);
        _createAndFund(employerB, ROOT_B, 700e18);

        vm.prank(employeeA);
        payroll.claim(hex"", _makeInputs(ROOT_A, employeeA, 300e18));
        vm.prank(employeeB);
        payroll.claim(hex"", _makeInputs(ROOT_B, employeeB, 700e18));

        assertEq(token.balanceOf(employeeA), 300e18);
        assertEq(token.balanceOf(employeeB), 700e18);
        assertEq(_balance(ROOT_A), 0);
        assertEq(_balance(ROOT_B), 0);
        assertEq(token.balanceOf(address(payroll)), 0);
    }

    /// `claimed` is tracked per payroll: claiming from ROOT_A does not mark you
    /// claimed at ROOT_B.
    function test_claimed_is_per_payroll() public {
        _createAndFund(employerA, ROOT_A, 100e18);
        _createAndFund(employerB, ROOT_B, 100e18);

        vm.prank(employeeA);
        payroll.claim(hex"", _makeInputs(ROOT_A, employeeA, 100e18));

        assertTrue(payroll.hasClaimed(ROOT_A, employeeA));
        assertFalse(payroll.hasClaimed(ROOT_B, employeeA));
    }

    /// One employer runs two payrolls; an employee in both can claim from each
    /// independently (per-root balances + per-root claimed flags).
    function test_sameEmployer_twoPayrolls_independentClaims() public {
        _createAndFund(employerA, ROOT_A, 300e18);
        _createAndFund(employerA, ROOT_B, 700e18);

        vm.startPrank(employeeA);
        payroll.claim(hex"", _makeInputs(ROOT_A, employeeA, 300e18));
        payroll.claim(hex"", _makeInputs(ROOT_B, employeeA, 700e18));
        vm.stopPrank();

        assertEq(token.balanceOf(employeeA), 1000e18);
        assertTrue(payroll.hasClaimed(ROOT_A, employeeA));
        assertTrue(payroll.hasClaimed(ROOT_B, employeeA));
        assertEq(_balance(ROOT_A), 0);
        assertEq(_balance(ROOT_B), 0);
    }

    // ── Withdraw ───────────────────────────────────────────────────────────────

    function test_withdraw_success() public {
        uint256 amount = 200e18;
        _createAndFund(employerA, ROOT_A, amount);
        vm.prank(employerA);
        payroll.withdraw(ROOT_A, amount);
        assertEq(token.balanceOf(employerA), amount);
        assertEq(_balance(ROOT_A), 0);
    }

    function test_withdraw_reverts_insufficient() public {
        _createAndFund(employerA, ROOT_A, 100e18);
        vm.prank(employerA);
        vm.expectRevert(PayrollManager.InsufficientFunds.selector);
        payroll.withdraw(ROOT_A, 101e18);
    }

    /// A non-owner cannot withdraw a payroll's funds.
    function test_withdraw_reverts_notOwner() public {
        _createAndFund(employerA, ROOT_A, 1000e18);
        vm.prank(employerB);
        vm.expectRevert(PayrollManager.NotOwner.selector);
        payroll.withdraw(ROOT_A, 1);
        assertEq(_balance(ROOT_A), 1000e18);
    }
}
