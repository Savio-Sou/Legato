// E2E phase 1 — EMPLOYEE registers a shielded key through the real /claim UI.
// Dev server must run with NEXT_PUBLIC_DEV_PRIVATE_KEY = the EMPLOYEE key.
import { getChromium, BASE_URL, connectAndWait, readRegistered, makeAsserter } from "./lib.mjs";

const EMPLOYEE = process.env.EMPLOYEE_ADDRESS;
if (!EMPLOYEE) throw new Error("EMPLOYEE_ADDRESS env required");

const A = makeAsserter("REGISTER PHASE");
const chromium = await getChromium();
const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ ignoreHTTPSErrors: true })).newPage();
page.on("pageerror", (e) => console.error("  [pageerror]", e.message.slice(0, 160)));

try {
  console.log(`REGISTER: employee=${EMPLOYEE}`);
  await page.goto(`${BASE_URL}/claim`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await connectAndWait(page, () =>
    page.getByText(/Register your shielded key|Shielded balance|No spendable note|Scanning the pool/),
  );
  A.ok(true, "connected as employee");

  const regBtn = page.getByRole("button", { name: "Register shielded key" });
  if (await regBtn.count().catch(() => 0)) {
    await regBtn.click();
    await page
      .getByText(/No spendable note|Scanning the pool|Shielded balance/)
      .first()
      .waitFor({ timeout: 120000 });
    A.ok(true, "registration submitted + mined");
  } else {
    A.ok(true, "already registered (reusing key)");
  }
} catch (e) {
  A.fail("register flow: " + e.message.split("\n")[0]);
}

const registered = await readRegistered(EMPLOYEE).catch((e) => `ERR ${e.shortMessage || e.message}`);
A.ok(registered === true, `keys[employee].registered == true (got ${registered})`);

const rc = A.finish();
await browser.close();
process.exit(rc);
