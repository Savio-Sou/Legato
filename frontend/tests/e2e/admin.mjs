// E2E — ADMIN journey, driven through the real /admin UI.
// Requires the dev server running with NEXT_PUBLIC_DEV_PRIVATE_KEY = the EMPLOYER key
// (the account that creates + funds its own payroll). Adds EMPLOYEE_ADDRESS to the
// payroll tree, then approve + createPayroll + fund on-chain. Asserts UI + chain state.
import {
  getChromium, BASE_URL, connectAndWait,
  readPayrollActive, readContractBalance, makeAsserter,
} from "./lib.mjs";

const EMPLOYEE = process.env.EMPLOYEE_ADDRESS;
const EMPLOYER = process.env.EMPLOYER_ADDRESS;
const SALARY = process.env.SALARY || "1";
const FUND = process.env.FUND || "5";
if (!EMPLOYEE) throw new Error("EMPLOYEE_ADDRESS env required");
if (!EMPLOYER) throw new Error("EMPLOYER_ADDRESS env required");

const A = makeAsserter("ADMIN PHASE");
const chromium = await getChromium();
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.error("  [pageerror]", e.message.slice(0, 160)));

let payrollRoot = null;

try {
  console.log(`ADMIN: employer=${EMPLOYER} employee=${EMPLOYEE} salary=${SALARY} fund=${FUND}`);
  await page.goto(`${BASE_URL}/admin`, { waitUntil: "domcontentloaded", timeout: 30000 });

  // Connect via the dev connector (instant, no dialog). Connected => the primary
  // action becomes "Build tree & activate payroll".
  const buildBtn = page.getByRole("button", { name: "Build tree & activate payroll" });
  await connectAndWait(page, () => buildBtn);
  A.ok(true, "connected as admin (dev connector, no wallet dialog)");

  // Fill the first employee row + fund amount.
  await page.getByPlaceholder("Employee address (0x…)").first().fill(EMPLOYEE);
  await page.getByPlaceholder("Salary (USD)").first().fill(SALARY);
  await page.locator('input[type="number"]:not([placeholder])').first().fill(FUND);

  // Build tree -> approve -> createPayroll -> fund (3 txs).
  await buildBtn.click();
  await page.getByText(/Payroll live|Payroll is live/i).first().waitFor({ timeout: 180000 });
  A.ok(true, 'admin UI reached "Payroll live"');

  // The shareable claim link now carries the payroll's Merkle root. Scrape it and
  // use that root for the on-chain assertions below (and the claim phase reuses it).
  const link = await page.locator('input[readonly]').first().inputValue();
  const m = link.match(/[?&]payroll=(0x[0-9a-fA-F]{64})\b/);
  payrollRoot = m ? m[1] : null;
  A.ok(!!payrollRoot, `claim link carries a payroll root (${link})`);
} catch (e) {
  A.fail("admin UI flow: " + e.message);
}

// On-chain truth, keyed by the payroll's root.
const active = payrollRoot
  ? await readPayrollActive(payrollRoot).catch((e) => `ERR ${e.shortMessage || e.message}`)
  : "no-root";
const bal = payrollRoot ? await readContractBalance(payrollRoot).catch(() => null) : null;
const need = BigInt(SALARY) * 1_000_000n;
A.ok(payrollRoot && /^0x[0-9a-f]{64}$/i.test(payrollRoot), `payroll root looks valid (got ${payrollRoot?.slice(0, 12)}…)`);
A.ok(active === true, `payrollActive == true (got ${active})`);
A.ok(typeof bal === "bigint" && bal >= need, `payroll balance ${bal} >= salary ${need}`);

const rc = A.finish(browser);
await browser.close();
process.exit(rc);
