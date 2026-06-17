// E2E phase 2 — EMPLOYER deposits an encrypted note for the employee via the real /admin UI.
// Dev server must run with NEXT_PUBLIC_DEV_PRIVATE_KEY = the EMPLOYER key.
import { getChromium, BASE_URL, connectAndWait, readPoolBalance, makeAsserter } from "./lib.mjs";

const EMPLOYEE = process.env.EMPLOYEE_ADDRESS;
const SALARY = process.env.SALARY || "2"; // pathUSD
if (!EMPLOYEE) throw new Error("EMPLOYEE_ADDRESS env required");
const salaryWei = BigInt(Math.round(Number(SALARY) * 1e6));

const A = makeAsserter("DEPOSIT PHASE");
const poolBefore = await readPoolBalance().catch(() => 0n);

const chromium = await getChromium();
const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ ignoreHTTPSErrors: true })).newPage();
page.on("pageerror", (e) => console.error("  [pageerror]", e.message.slice(0, 160)));

try {
  console.log(`DEPOSIT: employee=${EMPLOYEE} salary=${SALARY}`);
  await page.goto(`${BASE_URL}/admin`, { waitUntil: "domcontentloaded", timeout: 30000 });
  const fundBtn = page.getByRole("button", { name: "Fund payroll into the pool" });
  await connectAndWait(page, () => fundBtn);
  A.ok(true, "connected as employer");

  await page.getByPlaceholder("Employee address (0x…)").first().fill(EMPLOYEE);
  await page.getByPlaceholder("Salary (USD)").first().fill(SALARY);
  await fundBtn.click();
  await page.getByText(/deposited into the pool/i).waitFor({ timeout: 180000 });
  A.ok(true, "admin UI reached deposited state");
} catch (e) {
  A.fail("deposit flow: " + e.message.split("\n")[0]);
  const shown = await page.locator("main").innerText().catch(() => "(unreadable)");
  console.error("  --- /admin main text ---\n" + shown.replace(/^/gm, "    ").slice(0, 800));
}

const poolAfter = await readPoolBalance().catch(() => poolBefore);
const delta = poolAfter - poolBefore;
A.ok(delta === salaryWei, `pool balance increased by exactly the salary: ${delta} == ${salaryWei}`);

const rc = A.finish();
await browser.close();
process.exit(rc);
