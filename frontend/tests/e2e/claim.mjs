// E2E — EMPLOYEE journey, driven through the real /claim UI.
// Requires the dev server running with NEXT_PUBLIC_DEV_PRIVATE_KEY = the EMPLOYEE
// key (an address that the admin phase put in the tree). Generates a real ZK proof
// in-browser and submits claim(). Asserts UI + chain state (claimed flip + payout).
import {
  getChromium, BASE_URL, connectAndWait,
  readClaimed, readContractBalance, readPathUsdBalanceOf, verifyOnChain, simulateClaim, makeAsserter,
} from "./lib.mjs";

const EMPLOYEE = process.env.EMPLOYEE_ADDRESS;
const PAYROLL_ROOT = process.env.PAYROLL_ROOT;
const SALARY = process.env.SALARY || "1";
if (!EMPLOYEE) throw new Error("EMPLOYEE_ADDRESS env required");
if (!PAYROLL_ROOT) throw new Error("PAYROLL_ROOT env required");
const expectedPayout = BigInt(SALARY) * 1_000_000n;

const A = makeAsserter("CLAIM PHASE");

// Preconditions on chain (payroll is keyed by its Merkle root).
const claimedBefore = await readClaimed(PAYROLL_ROOT, EMPLOYEE).catch(() => null);
const contractBalBefore = await readContractBalance(PAYROLL_ROOT).catch(() => 0n);
A.ok(claimedBefore === false, `precondition: claimed[employee] == false (got ${claimedBefore})`);

const chromium = await getChromium();
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.error("  [pageerror]", e.message.slice(0, 200)));
page.on("console", (m) => {
  const t = m.text();
  if (m.type() === "error" && !/Datadog|cloudflareinsights|ERR_NAME_NOT_RESOLVED|_nonReactive|Match-/.test(t))
    console.error("  [console.error]", t.slice(0, 200));
});

try {
  console.log(`CLAIM: employee=${EMPLOYEE} payroll=${PAYROLL_ROOT} expectedPayout=${expectedPayout}`);
  await page.goto(`${BASE_URL}/claim?payroll=${PAYROLL_ROOT}`, { waitUntil: "domcontentloaded", timeout: 30000 });

  // Connect via the dev connector. Connected => the on-chain status panel renders.
  await connectAndWait(page, () => page.getByText("On-chain status"));
  A.ok(true, "connected as employee (dev connector, no wallet dialog)");

  // The claim button should be actionable (not "Already claimed" / "No active payroll").
  const claimBtn = page.getByRole("button", { name: "Generate proof & claim salary" });
  await claimBtn.waitFor({ timeout: 15000 });
  A.ok(!(await claimBtn.isDisabled()), "claim button is enabled");

  // Generate proof (~7s) + submit claim.
  await claimBtn.click();
  await page.getByText("Generating proof…").waitFor({ timeout: 20000 });
  A.ok(true, "proof generation started");
  await page.getByText("pathUSD claimed").waitFor({ timeout: 180000 });
  A.ok(true, 'claim UI reached "pathUSD claimed"');
} catch (e) {
  A.fail("claim UI flow: " + e.message.split("\n")[0]);
  // Pull the exact proof the page generated and test it directly against chain.
  const dbg = await page.evaluate(() => window.__claimDebug).catch(() => null);
  if (dbg) {
    console.error("  on-chain verify(proof,pub):", await verifyOnChain(dbg.proof, dbg.pub));
    console.error("  simulate claim():", await simulateClaim(dbg.proof, dbg.pub, EMPLOYEE));
    const cerr = await page.evaluate(() => window.__claimError).catch(() => null);
    console.error("  dev-connector send error:", JSON.stringify(cerr, null, 1));
  } else {
    const shown = await page.locator("main").innerText().catch(() => "(unreadable)");
    console.error("  --- /claim main text at failure ---\n" + shown.replace(/^/gm, "    ").slice(0, 600));
  }
}

// On-chain truth. Gas is paid in pathUSD, so assert the payout via the CONTRACT's
// balance delta (clean) rather than the employee's (which also pays gas).
const claimedAfter = await readClaimed(PAYROLL_ROOT, EMPLOYEE).catch((e) => `ERR ${e.shortMessage || e.message}`);
const contractBalAfter = await readContractBalance(PAYROLL_ROOT).catch(() => contractBalBefore);
const empBal = await readPathUsdBalanceOf(EMPLOYEE).catch(() => 0n);
const contractDelta = contractBalBefore - contractBalAfter;
A.ok(claimedAfter === true, `claimed[employee] == true after claim (got ${claimedAfter})`);
A.ok(contractDelta === expectedPayout, `contract paid out exactly the salary: ${contractDelta} == ${expectedPayout}`);
console.log(`  (employee pathUSD now ${empBal} — salary received minus gas)`);

const rc = A.finish(browser);
await browser.close();
process.exit(rc);
