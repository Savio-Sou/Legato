// Shared helpers for the Legato end-to-end tests.
//
// These run as plain Node scripts driving the REAL frontend with the Playwright
// *library* API (not @playwright/test, which isn't installed here). On-chain
// assertions use viem reads against Tempo Moderato. The dev wallet connector
// (src/lib/wagmi.ts, gated by NEXT_PUBLIC_DEV_PRIVATE_KEY) lets "Connect" resolve
// instantly in headless Chromium with no passkey/iframe/popup.

import { createPublicClient, http } from "viem";
import { tempoModerato } from "viem/chains";

/** Resolve Playwright's chromium from a local install or the global CLI install. */
export async function getChromium() {
  for (const spec of ["playwright", "/usr/local/lib/node_modules/playwright/index.js"]) {
    try {
      const m = await import(spec);
      const c = (m.default ?? m).chromium;
      if (c) return c;
    } catch {
      /* try next */
    }
  }
  throw new Error("Playwright not found. `npm i -D playwright` or use the global install.");
}

export const RPC = "https://rpc.moderato.tempo.xyz";
// Override via PAYROLL_MANAGER_ADDRESS env after redeploying the contract.
export const PAYROLL_MANAGER = process.env.PAYROLL_MANAGER_ADDRESS || "0xb431D5dD73e8308fe27c9f9140F03cB24dDe91d1";
export const PATH_USD = "0x20C0000000000000000000000000000000000000";
export const BASE_URL = "https://localhost:3000";

export const publicClient = createPublicClient({ chain: tempoModerato, transport: http(RPC) });

const PM_ABI = [
  {
    type: "function",
    name: "getPayroll",
    inputs: [{ type: "bytes32" }],
    outputs: [{ type: "address" }, { type: "uint256" }, { type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "hasClaimed",
    inputs: [{ type: "bytes32" }, { type: "address" }],
    outputs: [{ type: "bool" }],
    stateMutability: "view",
  },
];
const ERC20_ABI = [
  { type: "function", name: "balanceOf", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
];

// Payrolls are keyed by Merkle root: getPayroll(root) -> [owner, balance, active].
export const readPayroll = (root) =>
  publicClient.readContract({ address: PAYROLL_MANAGER, abi: PM_ABI, functionName: "getPayroll", args: [root] });
export const readPayrollActive = async (root) => (await readPayroll(root))[2];
export const readOwner = async (root) => (await readPayroll(root))[0];
// A payroll's funded balance (funds are isolated per root).
export const readContractBalance = async (root) => (await readPayroll(root))[1];
export const readClaimed = (root, addr) =>
  publicClient.readContract({ address: PAYROLL_MANAGER, abi: PM_ABI, functionName: "hasClaimed", args: [root, addr] });
export const readPathUsdBalanceOf = (addr) =>
  publicClient.readContract({ address: PATH_USD, abi: ERC20_ABI, functionName: "balanceOf", args: [addr] });

// --- diagnostics: verify a proof against the deployed verifier + simulate claim ---
export const VERIFIER = "0xB60c723C8F9e4E564f18AAF1Bb8e05D4D2a7e4cd";
const VERIFIER_ABI = [
  { type: "function", name: "verify", inputs: [{ type: "bytes" }, { type: "bytes32[]" }], outputs: [{ type: "bool" }], stateMutability: "view" },
];
const CLAIM_ABI = [
  { type: "function", name: "claim", inputs: [{ type: "bytes", name: "proof" }, { type: "bytes32[]", name: "publicInputs" }], outputs: [], stateMutability: "nonpayable" },
  ...["AlreadyClaimed", "PayrollNotActive", "PayrollExists", "InsufficientFunds", "TransferFailed", "CallerMismatch", "NotOwner", "ZeroRoot", "InvalidInputsLength", "InvalidProof"].map((name) => ({ type: "error", name, inputs: [] })),
];

export async function verifyOnChain(proof, pub) {
  try {
    return String(await publicClient.readContract({ address: VERIFIER, abi: VERIFIER_ABI, functionName: "verify", args: [proof, pub] }));
  } catch (e) {
    return "verify() REVERTED: " + (e.shortMessage || e.message).split("\n")[0];
  }
}
// claim() selects the payroll from the proof's root (publicInputs[0]) — no employer arg.
export async function simulateClaim(proof, pub, from) {
  try {
    await publicClient.simulateContract({ address: PAYROLL_MANAGER, abi: CLAIM_ABI, functionName: "claim", args: [proof, pub], account: from });
    return "would SUCCEED";
  } catch (e) {
    return (e.shortMessage || e.message).split("\n").slice(0, 3).join(" | ");
  }
}

/**
 * Click "Connect" and wait until the page shows it's connected.
 * Robust against cold-compile/hydration races: settles, retries the click, and
 * treats an already-present ready signal as success.
 * @param readyLocator () => Locator that becomes visible only once connected.
 */
export async function connectAndWait(page, readyLocator) {
  await page.waitForTimeout(1500); // let the client bundle hydrate so onClick is wired
  for (let attempt = 1; attempt <= 4; attempt++) {
    if (await readyLocator().count().catch(() => 0)) return; // already connected
    // The dev (secp256k1) connector connects on either passkey button (it ignores
    // the register capability and returns the pinned account). Use "Sign in".
    const btn = page.getByRole("button", { name: /sign in with passkey|create passkey/i }).first();
    if (await btn.count().catch(() => 0)) await btn.click({ timeout: 5000 }).catch(() => {});
    try {
      await readyLocator().first().waitFor({ state: "visible", timeout: 12000 });
      return;
    } catch {
      await page.waitForTimeout(1000);
    }
  }
  throw new Error("connect: ready signal never appeared after retries");
}

/** Minimal assertion harness — collects failures, reports, sets exit code. */
export function makeAsserter(label) {
  let failed = false;
  return {
    ok(cond, msg) {
      if (cond) console.log(`  ✓ ${msg}`);
      else { failed = true; console.error(`  ✗ ASSERT FAIL: ${msg}`); }
    },
    fail(msg) { failed = true; console.error(`  ✗ ${msg}`); },
    finish(browser) {
      console.log(`${label}: ${failed ? "❌ FAIL" : "✅ PASS"}`);
      return failed ? 1 : 0;
    },
  };
}
