// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

import {MerkleTreeWithHistory} from "./MerkleTreeWithHistory.sol";

interface IHonkVerifier {
    function verify(bytes calldata proof, bytes32[] calldata publicInputs) external view returns (bool);
}

// TIP-20 / ERC-20 minimal interface for pathUSD
interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/// @notice Permissionless ZK shielded pool for private payroll on Tempo.
///
///         A single shared commitment tree holds notes `C = Poseidon(value, pk, blinding)`. Employers
///         `deposit` pathUSD and insert a note per employee (the deposit proof binds the public pulled
///         `value` to the hidden-owner commitment, so the shared pool cannot be over-committed).
///         Employees `withdraw` by proving membership + a nullifier, paying out an arbitrary
///         `publicAmount` to themselves and re-committing the remainder as a change note. Note payloads
///         are posted encrypted on-chain (`NewCommitment`), so there is no server — the client rebuilds
///         the tree and finds its notes by scanning events.
///
///         Privacy: the employer's payroll table (who is paid how much) never appears on-chain. The
///         residual leak is that `withdraw` to self publicly reveals (recipient, amount); partial
///         withdrawals blunt amount-matching but a relayer + denominations (v2) are needed to fully
///         break timing/linkage.
contract ShieldedPool is MerkleTreeWithHistory {
    IHonkVerifier public immutable depositVerifier;
    IHonkVerifier public immutable withdrawVerifier;
    IERC20 public immutable pathUSD;

    struct ShieldedKey {
        uint256 pk; // commitment owner pubkey = Poseidon(sk)
        uint256 encX; // BabyJubJub encryption pubkey x
        uint256 encY; // BabyJubJub encryption pubkey y
        bool registered;
    }

    mapping(address => ShieldedKey) public keys;
    mapping(bytes32 => bool) public nullifierSpent;

    event KeyRegistered(address indexed user, uint256 pk, uint256 encX, uint256 encY);
    event NewCommitment(
        bytes32 indexed commitment, uint32 leafIndex, bytes ephPubkey, bytes ciphertext, bytes32 tag
    );
    event Withdrawal(bytes32 indexed nullifier, address indexed recipient, uint256 amount);

    error AlreadyRegistered();
    error InvalidInputsLength();
    error InvalidProof();
    error UnknownRoot();
    error NullifierAlreadySpent();
    error TransferFailed();

    constructor(address _depositVerifier, address _withdrawVerifier, address _pathUSD, uint32 _levels)
        MerkleTreeWithHistory(_levels)
    {
        depositVerifier = IHonkVerifier(_depositVerifier);
        withdrawVerifier = IHonkVerifier(_withdrawVerifier);
        pathUSD = IERC20(_pathUSD);
    }

    /// @notice Register your shielded keys once. `pk` is used by employers to build your note
    ///         commitment; (encX, encY) is your BabyJubJub key employers encrypt the note to.
    function registerKey(uint256 pk, uint256 encX, uint256 encY) external {
        if (keys[msg.sender].registered) revert AlreadyRegistered();
        keys[msg.sender] = ShieldedKey(pk, encX, encY, true);
        emit KeyRegistered(msg.sender, pk, encX, encY);
    }

    /// @notice Deposit pathUSD and insert one encrypted note into the pool.
    /// @param publicInputs [value, commitment] — the deposit proof binds them so `commitment` commits
    ///        exactly `value` pathUSD (prevents over-committing the shared pool).
    function deposit(
        bytes calldata proof,
        bytes32[] calldata publicInputs,
        bytes calldata ephPubkey,
        bytes calldata ciphertext,
        bytes32 tag
    ) external {
        if (publicInputs.length != 2) revert InvalidInputsLength();
        uint256 value = uint256(publicInputs[0]);
        bytes32 commitment = publicInputs[1];

        if (!depositVerifier.verify(proof, publicInputs)) revert InvalidProof();
        if (!pathUSD.transferFrom(msg.sender, address(this), value)) revert TransferFailed();

        uint32 leafIndex = _insert(commitment);
        emit NewCommitment(commitment, leafIndex, ephPubkey, ciphertext, tag);
    }

    /// @notice Withdraw `publicAmount` from your note to `recipient`, re-committing the remainder.
    /// @param publicInputs [root, nullifier, recipient, publicAmount, newCommitment].
    /// @param ephPubkey/ciphertext/tag the self-encrypted change note, so it is discoverable by scanning.
    function withdraw(
        bytes calldata proof,
        bytes32[] calldata publicInputs,
        bytes calldata ephPubkey,
        bytes calldata ciphertext,
        bytes32 tag
    ) external {
        if (publicInputs.length != 5) revert InvalidInputsLength();
        bytes32 root = publicInputs[0];
        bytes32 nullifier = publicInputs[1];
        address recipient = address(uint160(uint256(publicInputs[2])));
        uint256 publicAmount = uint256(publicInputs[3]);
        bytes32 newCommitment = publicInputs[4];

        if (!isKnownRoot(root)) revert UnknownRoot();
        if (nullifierSpent[nullifier]) revert NullifierAlreadySpent();
        if (!withdrawVerifier.verify(proof, publicInputs)) revert InvalidProof();

        // checks-effects-interactions: mark + insert before the external transfer
        nullifierSpent[nullifier] = true;
        uint32 leafIndex = _insert(newCommitment);

        if (!pathUSD.transfer(recipient, publicAmount)) revert TransferFailed();

        emit Withdrawal(nullifier, recipient, publicAmount);
        emit NewCommitment(newCommitment, leafIndex, ephPubkey, ciphertext, tag);
    }

    function isSpent(bytes32 nullifier) external view returns (bool) {
        return nullifierSpent[nullifier];
    }
}
