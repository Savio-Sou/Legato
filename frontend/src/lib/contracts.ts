import type { Abi } from "viem";

// ─── Deployed addresses (Tempo Moderato) ────────────────────────────────────
// Redeploy: forge script script/Deploy.s.sol --rpc-url tempo --broadcast
export const SHIELDED_POOL_ADDRESS = (
  process.env.NEXT_PUBLIC_SHIELDED_POOL_ADDRESS ?? "0xa65CE1D39BA72B0Ef629d88E124Db2C001f72273"
) as `0x${string}`;

export const DEPOSIT_VERIFIER_ADDRESS = (
  process.env.NEXT_PUBLIC_DEPOSIT_VERIFIER_ADDRESS ?? "0xAb801EE422Da97eC917A162D6599395659552083"
) as `0x${string}`;

export const WITHDRAW_VERIFIER_ADDRESS = (
  process.env.NEXT_PUBLIC_WITHDRAW_VERIFIER_ADDRESS ?? "0x7a28e88730ff5db3fB7339B4EE2a7395B42B1f6F"
) as `0x${string}`;

// pathUSD on Tempo Moderato testnet (6 decimals)
export const PATH_USD_ADDRESS = (
  process.env.NEXT_PUBLIC_PATH_USD_ADDRESS ?? "0x20C0000000000000000000000000000000000000"
) as `0x${string}`;

export const PATH_USD_DECIMALS = 6;

// Block the pool was deployed at — lower bound for NewCommitment log scans.
export const POOL_DEPLOY_BLOCK = BigInt(
  process.env.NEXT_PUBLIC_POOL_DEPLOY_BLOCK ?? "22653355",
);

// ─── ABIs ───────────────────────────────────────────────────────────────────
export const SHIELDED_POOL_ABI = [
  {
    type: "function",
    name: "registerKey",
    inputs: [
      { name: "pk", type: "uint256" },
      { name: "encX", type: "uint256" },
      { name: "encY", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "keys",
    inputs: [{ name: "user", type: "address" }],
    outputs: [
      { name: "pk", type: "uint256" },
      { name: "encX", type: "uint256" },
      { name: "encY", type: "uint256" },
      { name: "registered", type: "bool" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "deposit",
    inputs: [
      { name: "proof", type: "bytes" },
      { name: "publicInputs", type: "bytes32[]" },
      { name: "ephPubkey", type: "bytes" },
      { name: "ciphertext", type: "bytes" },
      { name: "tag", type: "bytes32" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "withdraw",
    inputs: [
      { name: "proof", type: "bytes" },
      { name: "publicInputs", type: "bytes32[]" },
      { name: "ephPubkey", type: "bytes" },
      { name: "ciphertext", type: "bytes" },
      { name: "tag", type: "bytes32" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "isSpent",
    inputs: [{ name: "nullifier", type: "bytes32" }],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getLastRoot",
    inputs: [],
    outputs: [{ name: "", type: "bytes32" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "isKnownRoot",
    inputs: [{ name: "root", type: "bytes32" }],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "nextIndex",
    inputs: [],
    outputs: [{ name: "", type: "uint32" }],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "KeyRegistered",
    inputs: [
      { name: "user", type: "address", indexed: true },
      { name: "pk", type: "uint256", indexed: false },
      { name: "encX", type: "uint256", indexed: false },
      { name: "encY", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "NewCommitment",
    inputs: [
      { name: "commitment", type: "bytes32", indexed: true },
      { name: "leafIndex", type: "uint32", indexed: false },
      { name: "ephPubkey", type: "bytes", indexed: false },
      { name: "ciphertext", type: "bytes", indexed: false },
      { name: "tag", type: "bytes32", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Withdrawal",
    inputs: [
      { name: "nullifier", type: "bytes32", indexed: true },
      { name: "recipient", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  { type: "error", name: "AlreadyRegistered", inputs: [] },
  { type: "error", name: "InvalidInputsLength", inputs: [] },
  { type: "error", name: "InvalidProof", inputs: [] },
  { type: "error", name: "UnknownRoot", inputs: [] },
  { type: "error", name: "NullifierAlreadySpent", inputs: [] },
  { type: "error", name: "TransferFailed", inputs: [] },
] as const satisfies Abi;

export const ERC20_ABI = [
  {
    type: "function",
    name: "approve",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "decimals",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
  },
] as const satisfies Abi;
