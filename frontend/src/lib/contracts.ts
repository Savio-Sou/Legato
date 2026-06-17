import type { Abi } from "viem";

// ─── Deployed addresses (fill in after `forge script Deploy`) ───────────────
// Run: forge script script/Deploy.s.sol --rpc-url tempo --broadcast
export const VERIFIER_ADDRESS = (
  process.env.NEXT_PUBLIC_VERIFIER_ADDRESS ?? "0xB60c723C8F9e4E564f18AAF1Bb8e05D4D2a7e4cd"
) as `0x${string}`;

export const PAYROLL_MANAGER_ADDRESS = (
  process.env.NEXT_PUBLIC_PAYROLL_MANAGER_ADDRESS ?? "0xb431D5dD73e8308fe27c9f9140F03cB24dDe91d1"
) as `0x${string}`;

// pathUSD on Tempo Moderato testnet
export const PATH_USD_ADDRESS = (
  process.env.NEXT_PUBLIC_PATH_USD_ADDRESS ?? "0x20C0000000000000000000000000000000000000"
) as `0x${string}`;

// ─── ABIs ───────────────────────────────────────────────────────────────────
export const PAYROLL_MANAGER_ABI = [
  {
    type: "constructor",
    inputs: [
      { name: "_verifier", type: "address" },
      { name: "_pathUSD", type: "address" },
    ],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "createPayroll",
    inputs: [{ name: "root", type: "bytes32" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "fund",
    inputs: [
      { name: "root", type: "bytes32" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "createAndFund",
    inputs: [
      { name: "root", type: "bytes32" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "claim",
    inputs: [
      { name: "proof", type: "bytes" },
      { name: "publicInputs", type: "bytes32[]" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "withdraw",
    inputs: [
      { name: "root", type: "bytes32" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "getPayroll",
    inputs: [{ name: "root", type: "bytes32" }],
    outputs: [
      { name: "owner", type: "address" },
      { name: "balance", type: "uint256" },
      { name: "active", type: "bool" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "hasClaimed",
    inputs: [
      { name: "root", type: "bytes32" },
      { name: "employee", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "PayrollCreated",
    inputs: [
      { name: "employer", type: "address", indexed: true },
      { name: "root", type: "bytes32", indexed: true },
    ],
  },
  {
    type: "event",
    name: "Funded",
    inputs: [
      { name: "root", type: "bytes32", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Claimed",
    inputs: [
      { name: "root", type: "bytes32", indexed: true },
      { name: "employee", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Withdrawn",
    inputs: [
      { name: "root", type: "bytes32", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  // Custom errors — included so viem can decode revert reasons (e.g. claim()).
  { type: "error", name: "AlreadyClaimed", inputs: [] },
  { type: "error", name: "PayrollNotActive", inputs: [] },
  { type: "error", name: "PayrollExists", inputs: [] },
  { type: "error", name: "InsufficientFunds", inputs: [] },
  { type: "error", name: "TransferFailed", inputs: [] },
  { type: "error", name: "CallerMismatch", inputs: [] },
  { type: "error", name: "NotOwner", inputs: [] },
  { type: "error", name: "ZeroRoot", inputs: [] },
  { type: "error", name: "InvalidInputsLength", inputs: [] },
  { type: "error", name: "InvalidProof", inputs: [] },
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
