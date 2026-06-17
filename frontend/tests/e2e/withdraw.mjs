// E2E phase 3 — EMPLOYEE scans the pool and makes a PARTIAL withdrawal via the real /claim UI.
// Dev server must run with NEXT_PUBLIC_DEV_PRIVATE_KEY = the EMPLOYEE key (same as register phase).
import {
  getChromium, BASE_URL, connectAndWait, readPoolBalance, readNextIndex, readPathUsdBalanceOf, makeAsserter,
} from "./lib.mjs";

const EMPLOYEE = process.env.EMPLOYEE_ADDRESS;
const WITHDRAW = process.env.WITHDRAW_AMOUNT || "1"; // pathUSD (may span multiple notes)
const EXPECTED_NOTES = Number(process.env.EXPECTED_NOTES || "1"); // notes the balance should aggregate
const EXPECTED_SPENT = Number(process.env.EXPECTED_SPENT || "1"); // notes this withdrawal consumes
if (!EMPLOYEE) throw new Error("EMPLOYEE_ADDRESS env required");
const withdrawWei = BigInt(Math.round(Number(WITHDRAW) * 1e6));

const A = makeAsserter("WITHDRAW PHASE");
const poolBefore = await readPoolBalance().catch(() => 0n);
const idxBefore = Number(await readNextIndex().catch(() => 0));
const empBefore = await readPathUsdBalanceOf(EMPLOYEE).catch(() => 0n);

const chromium = await getChromium();
const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ ignoreHTTPSErrors: true })).newPage();
page.on("pageerror", (e) => console.error("  [pageerror]", e.message.slice(0, 200)));
page.on("console", (m) => {
  const t = m.text();
  if (m.type() === "error" && !/Datadog|cloudflareinsights|ERR_NAME_NOT_RESOLVED|_nonReactive|Match-/.test(t))
    console.error("  [console.error]", t.slice(0, 200));
});

try {
  console.log(`WITHDRAW: employee=${EMPLOYEE} amount=${WITHDRAW}`);
  await page.goto(`${BASE_URL}/claim`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await connectAndWait(page, () => page.getByText(/Shielded balance|Scanning the pool|No spendable note/));
  A.ok(true, "connected as employee");

  const withdrawBtn = page.getByRole("button", { name: "Generate proof & withdraw" });
  await withdrawBtn.waitFor({ timeout: 60000 });
  A.ok(true, "spendable note(s) found (shielded balance shown)");

  // Regression: the balance must AGGREGATE all of the user's notes, not just the largest one.
  if (EXPECTED_NOTES > 1) {
    const multi = await page
      .getByText(new RegExp(`across ${EXPECTED_NOTES} notes`))
      .count()
      .catch(() => 0);
    A.ok(multi > 0, `shielded balance aggregates ${EXPECTED_NOTES} notes (not just the largest)`);
  }

  await page.locator('input[type="number"]').first().fill(WITHDRAW);
  await withdrawBtn.click();
  await page.getByText(/Generating zero-knowledge proof/i).first().waitFor({ timeout: 30000 }).catch(() => {});
  A.ok(true, "proof generation started");
  await page.getByText("pathUSD withdrawn").waitFor({ timeout: 180000 });
  A.ok(true, 'claim UI reached "pathUSD withdrawn"');
} catch (e) {
  A.fail("withdraw flow: " + e.message.split("\n")[0]);
  const cerr = await page.evaluate(() => window.__claimError).catch(() => null);
  if (cerr) console.error("  withdraw send error:", JSON.stringify(cerr));
  const shown = await page.locator("main").innerText().catch(() => "(unreadable)");
  console.error("  --- /claim main text ---\n" + shown.replace(/^/gm, "    ").slice(0, 800));
}

const poolAfter = await readPoolBalance().catch(() => poolBefore);
const idxAfter = Number(await readNextIndex().catch(() => idxBefore));
const empAfter = await readPathUsdBalanceOf(EMPLOYEE).catch(() => empBefore);
const poolDelta = poolBefore - poolAfter;

A.ok(poolDelta === withdrawWei, `pool paid out exactly the withdrawal: ${poolDelta} == ${withdrawWei}`);
A.ok(
  idxAfter === idxBefore + EXPECTED_SPENT,
  `change notes inserted (nextIndex ${idxBefore} -> ${idxAfter}, expected +${EXPECTED_SPENT})`,
);
console.log(`  (employee pathUSD ${empBefore} -> ${empAfter}; received withdrawal minus gas)`);

const rc = A.finish();
await browser.close();
process.exit(rc);
