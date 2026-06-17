// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

interface IHonkVerifier {
    function verify(bytes calldata proof, bytes32[] calldata publicInputs) external view returns (bool);
}

// TIP-20 / ERC-20 minimal interface for pathUSD
interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/// @notice Permissionless, multi-tenant payroll contract for the Legato demo.
///         Any employer can run their own payroll: they commit a Merkle root of
///         (address, salary) leaves, pre-fund it with pathUSD, and employees claim
///         their salary by submitting a ZK proof that their leaf is in the tree.
///
///         There is no privileged owner. Each payroll is namespaced under its own
///         Merkle root, so a single employer can run several payrolls concurrently
///         (one per distinct employee set) without them clobbering each other.
///         Each payroll's funds are tracked independently: an employee can only ever
///         be paid out of the balance funded for their own payroll, and one payroll's
///         employees can never drain another's funds.
///
///         Trade-off of keying by root (vs. by employer address): the root is public
///         (emitted on creation and embedded in the claim link), so an actor who knows
///         a payroll's *entire* leaf set could compute its root and occupy that slot
///         first. They still cannot fund/withdraw it (owner-gated) nor claim from it
///         (no valid membership proof), so the worst case is denying that exact root —
///         which requires already knowing every employee address and salary.
contract PayrollManager {
    IHonkVerifier public immutable verifier;
    IERC20 public immutable pathUSD;

    struct Payroll {
        address owner; // employer who created this payroll; only they may fund/withdraw
        uint256 balance; // pathUSD funded for this payroll, decremented as employees claim
        bool active; // set once createPayroll has been called for this root
        mapping(address => bool) claimed; // employees who have already claimed from this payroll
    }

    // Merkle root => its payroll. Keying by root (not employer) lets one employer
    // run multiple payrolls at once.
    mapping(bytes32 => Payroll) private payrolls;

    // Emitted so the frontend can reconstruct state from chain. `employer` on
    // PayrollCreated lets you map an employer back to the roots they created.
    event PayrollCreated(address indexed employer, bytes32 indexed root);
    event Funded(bytes32 indexed root, uint256 amount);
    event Claimed(bytes32 indexed root, address indexed employee, uint256 amount);
    event Withdrawn(bytes32 indexed root, uint256 amount);

    error AlreadyClaimed();
    error PayrollNotActive();
    error PayrollExists();
    error InsufficientFunds();
    error TransferFailed();
    error CallerMismatch();
    error NotOwner();
    error ZeroRoot();
    error InvalidInputsLength();
    error InvalidProof();

    constructor(address _verifier, address _pathUSD) {
        verifier = IHonkVerifier(_verifier);
        pathUSD = IERC20(_pathUSD);
    }

    /// @notice Create a payroll committing to a Merkle root. Permissionless — anyone
    ///         can set up a payroll, and the same employer can create several (one per
    ///         distinct root). Reverts if this exact root already has a payroll; build
    ///         a different tree (a changed leaf set yields a different root) instead.
    function createPayroll(bytes32 root) external {
        _createPayroll(root);
    }

    /// @notice Fund one of your payrolls with pathUSD so it can pay employees.
    function fund(bytes32 root, uint256 amount) external {
        _fund(root, amount);
    }

    /// @notice Create a payroll and fund it in a single transaction. Equivalent to
    ///         createPayroll(root) followed by fund(root, amount), but saves the
    ///         employer one passkey signature. The pathUSD allowance for this contract
    ///         must already cover `amount`.
    function createAndFund(bytes32 root, uint256 amount) external {
        _createPayroll(root);
        _fund(root, amount);
    }

    function _createPayroll(bytes32 root) internal {
        if (root == bytes32(0)) revert ZeroRoot();
        Payroll storage p = payrolls[root];
        if (p.active) revert PayrollExists();
        p.owner = msg.sender;
        p.active = true;
        emit PayrollCreated(msg.sender, root);
    }

    function _fund(bytes32 root, uint256 amount) internal {
        // Only the payroll's owner may fund it (owner is non-zero iff active).
        if (payrolls[root].owner != msg.sender) revert NotOwner();
        if (!pathUSD.transferFrom(msg.sender, address(this), amount)) revert TransferFailed();
        payrolls[root].balance += amount;
        emit Funded(root, amount);
    }

    /// @notice Claim salary from the payroll identified by the proof's Merkle root.
    /// @param proof        The Honk ZK proof bytes.
    /// @param publicInputs [root, employee_address, salary_amount] as bytes32 values.
    ///                     The root in publicInputs[0] selects which payroll to pay from.
    function claim(bytes calldata proof, bytes32[] calldata publicInputs) external {
        // publicInputs layout: [root, employee_address, salary_amount]
        if (publicInputs.length != 3) revert InvalidInputsLength();

        // The proof's root selects the payroll — no separate employer arg needed.
        bytes32 root = publicInputs[0];
        Payroll storage p = payrolls[root];
        if (!p.active) revert PayrollNotActive();

        // The caller must be the employee whose address is in the proof.
        address claimant = address(uint160(uint256(publicInputs[1])));
        if (claimant != msg.sender) revert CallerMismatch();

        if (p.claimed[msg.sender]) revert AlreadyClaimed();

        // ZK proof verification — reverts if the proof is invalid.
        if (!verifier.verify(proof, publicInputs)) revert InvalidProof();

        // Funds are isolated per payroll: this employee can only be paid out of
        // the balance funded for THIS root.
        uint256 amount = uint256(publicInputs[2]);
        if (p.balance < amount) revert InsufficientFunds();

        p.claimed[msg.sender] = true;
        p.balance -= amount;

        if (!pathUSD.transfer(msg.sender, amount)) revert TransferFailed();

        emit Claimed(root, msg.sender, amount);
    }

    /// @notice Withdraw remaining pathUSD from one of your payrolls
    ///         (e.g. after the payroll period ends).
    function withdraw(bytes32 root, uint256 amount) external {
        Payroll storage p = payrolls[root];
        if (p.owner != msg.sender) revert NotOwner();
        if (p.balance < amount) revert InsufficientFunds();
        p.balance -= amount;
        if (!pathUSD.transfer(msg.sender, amount)) revert TransferFailed();
        emit Withdrawn(root, amount);
    }

    // ── Views ────────────────────────────────────────────────────────────────

    /// @notice Read a payroll's summary by its Merkle root.
    function getPayroll(bytes32 root)
        external
        view
        returns (address owner, uint256 balance, bool active)
    {
        Payroll storage p = payrolls[root];
        return (p.owner, p.balance, p.active);
    }

    /// @notice Whether `employee` has already claimed from the payroll with this root.
    function hasClaimed(bytes32 root, address employee) external view returns (bool) {
        return payrolls[root].claimed[employee];
    }
}
