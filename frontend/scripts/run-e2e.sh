#!/usr/bin/env bash
# Legato end-to-end test.
#
# Drives the REAL frontend (admin + claim pages) against Tempo Moderato testnet
# using the dev wallet connector (src/lib/wagmi.ts, gated by
# NEXT_PUBLIC_DEV_PRIVATE_KEY). The dev connector pins ONE signer per server
# process, so we boot the dev server twice: once as the EMPLOYER (admin: build tree,
# createPayroll, fund) and once as a freshly-funded EMPLOYEE (claim: prove + claim).
#
# Employer key comes from contracts/.env. A new employee key is generated each run
# because PayrollManager's per-payroll claimed flag is permanent within a payroll.
#
# Usage:  npm run test:e2e     (from frontend/)   or   bash scripts/run-e2e.sh
set -uo pipefail
cd "$(dirname "$0")/.."                 # -> frontend/
export PATH="$PATH:/root/.foundry/bin"
RPC="https://rpc.moderato.tempo.xyz"
DEVLOG="/tmp/legato-e2e-dev.log"
SALARY=1; FUND=5
export SALARY FUND

echo "════════════════════════════ Legato E2E ════════════════════════════"

# --- Owner key (PayrollManager owner / funder) ---
if [ ! -f ../contracts/.env ]; then echo "FATAL: ../contracts/.env missing"; exit 1; fi
set -a; . ../contracts/.env; set +a
OWNER_KEY="${PRIVATE_KEY:-}"
[ -n "$OWNER_KEY" ] || { echo "FATAL: PRIVATE_KEY not set in ../contracts/.env"; exit 1; }

# The admin wallet IS the employer in the permissionless model: it creates + funds
# the payroll. Payrolls are keyed by Merkle root (not employer), so the claim phase
# keys off the root the admin phase produced (captured below), not this address.
EMPLOYER_ADDR=$(node -e "const{privateKeyToAccount}=require('viem/accounts');console.log(privateKeyToAccount('$OWNER_KEY').address)")
export EMPLOYER_ADDRESS="$EMPLOYER_ADDR"
echo "Employer (admin):   $EMPLOYER_ADDR"

# --- Fresh employee (rotated every run; claimed[] is permanent) ---
EMP_KEY=$(node -e "const{generatePrivateKey}=require('viem/accounts');console.log(generatePrivateKey())")
EMP_ADDR=$(node -e "const{privateKeyToAccount}=require('viem/accounts');console.log(privateKeyToAccount('$EMP_KEY').address)")
export EMPLOYEE_ADDRESS="$EMP_ADDR"
echo "Employee (this run): $EMP_ADDR"

# Tempo pays gas in pathUSD (the native "USD" balance is a non-spendable sentinel),
# and native value transfers are disallowed — but pathUSD is ERC20-transferable.
# So fund the fresh employee with pathUSD so it can pay gas for its claim tx.
PATH_USD=0x20C0000000000000000000000000000000000000
echo "Funding employee with pathUSD for gas..."
cast send "$PATH_USD" "transfer(address,uint256)" "$EMP_ADDR" 100000000 \
  --private-key "$OWNER_KEY" --rpc-url "$RPC" >/dev/null 2>&1 \
  || { echo "FATAL: pathUSD gas funding failed"; exit 1; }

# --- dev server control (dev connector key baked from .env.local at boot) ---
start_server() {  # $1 = private key for the dev connector, $2 = route to pre-warm
  printf 'NEXT_PUBLIC_DEV_PRIVATE_KEY=%s\n' "$1" > .env.local
  rm -rf .next                                   # force fresh compile so the new key is inlined
  npm run dev > "$DEVLOG" 2>&1 &
  for i in $(seq 1 90); do
    curl -sk -o /dev/null --max-time 2 https://localhost:3000 && break
    sleep 1
    [ "$i" = 90 ] && { echo "FATAL: dev server did not become ready (see $DEVLOG)"; return 1; }
  done
  # Pre-compile the route the test will use (Turbopack compiles on first request),
  # so the browser load is fast and connect doesn't race a cold compile.
  curl -sk -o /dev/null --max-time 60 "https://localhost:3000${2:-/}"
  return 0
}
stop_server() {
  pkill -f "next dev --experimental-https" 2>/dev/null
  for i in $(seq 1 30); do
    curl -sk -o /dev/null --max-time 1 https://localhost:3000 2>/dev/null || return 0
    sleep 1
  done
}

rc=0
stop_server                 # clear anything already on :3000
rm -f .payroll.json         # clean state

echo "──────────────── ADMIN phase (owner) ────────────────"
start_server "$OWNER_KEY" /admin || { rm -f .env.local; exit 1; }
node tests/e2e/admin.mjs; admin_rc=$?
stop_server
[ "$admin_rc" -eq 0 ] || { echo ">> ADMIN phase FAILED"; rc=1; }

# Capture the payroll's Merkle root (the claim id) from the server-side store the
# admin phase just wrote. State was reset above, so there's exactly one payroll.
if [ "$rc" -eq 0 ]; then
  PAYROLL_ROOT=$(node -e "const s=require('./.payroll.json');const k=Object.keys(s);if(!k.length)process.exit(3);console.log(k[k.length-1])" 2>/dev/null)
  export PAYROLL_ROOT
  [ -n "$PAYROLL_ROOT" ] || { echo ">> could not read payroll root from .payroll.json"; rc=1; }
  [ -n "$PAYROLL_ROOT" ] && echo "Payroll root:        $PAYROLL_ROOT"
fi

if [ "$rc" -eq 0 ]; then
  echo "──────────────── CLAIM phase (employee) ────────────────"
  start_server "$EMP_KEY" /claim || { rm -f .env.local; exit 1; }
  node tests/e2e/claim.mjs; claim_rc=$?
  stop_server
  [ "$claim_rc" -eq 0 ] || { echo ">> CLAIM phase FAILED"; rc=1; }
fi

rm -f .env.local            # back to hosted-wallet default
echo "═════════════════════════════════════════════════════════════════════"
[ "$rc" -eq 0 ] && echo "E2E RESULT: ✅ PASS" || echo "E2E RESULT: ❌ FAIL"
exit $rc
