// Shared helpers for the Legato shielded-pool end-to-end tests.
//
// Plain Node scripts driving the REAL frontend via the Playwright library API.
// On-chain assertions use viem reads against Tempo Moderato. The dev wallet
// connector (gated by NEXT_PUBLIC_DEV_PRIVATE_KEY) makes "Connect" resolve
// instantly in headless Chromium (no passkey/iframe/popup).

import { createPublicClient, http } from "viem";
import { tempoModerato } from "viem/chains";

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
export const SHIELDED_POOL =
  process.env.NEXT_PUBLIC_SHIELDED_POOL_ADDRESS || "0xa65CE1D39BA72B0Ef629d88E124Db2C001f72273";
export const PATH_USD = "0x20C0000000000000000000000000000000000000";
export const BASE_URL = "https://localhost:3000";

export const publicClient = createPublicClient({ chain: tempoModerato, transport: http(RPC) });

const POOL_ABI = [
  {
    type: "function",
    name: "keys",
    inputs: [{ type: "address" }],
    outputs: [{ type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "bool" }],
    stateMutability: "view",
  },
  { type: "function", name: "nextIndex", inputs: [], outputs: [{ type: "uint32" }], stateMutability: "view" },
  { type: "function", name: "isSpent", inputs: [{ type: "bytes32" }], outputs: [{ type: "bool" }], stateMutability: "view" },
];
const ERC20_ABI = [
  { type: "function", name: "balanceOf", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
];

export const readRegistered = async (addr) =>
  (await publicClient.readContract({ address: SHIELDED_POOL, abi: POOL_ABI, functionName: "keys", args: [addr] }))[3];
export const readNextIndex = () =>
  publicClient.readContract({ address: SHIELDED_POOL, abi: POOL_ABI, functionName: "nextIndex" });
export const readPathUsdBalanceOf = (addr) =>
  publicClient.readContract({ address: PATH_USD, abi: ERC20_ABI, functionName: "balanceOf", args: [addr] });
export const readPoolBalance = () => readPathUsdBalanceOf(SHIELDED_POOL);

/** Click "Connect" and wait until a post-connect signal appears. */
export async function connectAndWait(page, readyLocator) {
  await page.waitForTimeout(1500); // let the client bundle hydrate
  for (let attempt = 1; attempt <= 4; attempt++) {
    if (await readyLocator().count().catch(() => 0)) return;
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

export function makeAsserter(label) {
  let failed = false;
  return {
    ok(cond, msg) {
      if (cond) console.log(`  ✓ ${msg}`);
      else { failed = true; console.error(`  ✗ ASSERT FAIL: ${msg}`); }
    },
    fail(msg) { failed = true; console.error(`  ✗ ${msg}`); },
    finish() {
      console.log(`${label}: ${failed ? "❌ FAIL" : "✅ PASS"}`);
      return failed ? 1 : 0;
    },
  };
}
