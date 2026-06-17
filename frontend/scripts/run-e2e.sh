#!/usr/bin/env bash
# Legato shielded-pool end-to-end test.
#
# Drives the REAL frontend (admin + claim) against Tempo Moderato using the dev
# wallet connector (gated by NEXT_PUBLIC_DEV_PRIVATE_KEY). The dev connector pins
# ONE signer per server process, so we boot the dev server three times:
#   1) REGISTER  — employee registers a shielded key (/claim)
#   2) DEPOSIT   — employer funds an encrypted note for that employee (/admin)
#   3) WITHDRAW  — employee scans the pool and makes a partial withdrawal (/claim)
#
# Employer key comes from contracts/.env. A fresh employee key is generated each run
# (nullifiers are permanent, and a fresh shielded key avoids collisions).
#
# Usage:  npm run test:e2e   (from frontend/)   or   bash scripts/run-e2e.sh
set -uo pipefail
cd "$(dirname "$0")/.."                 # -> frontend/
export PATH="$PATH:/root/.foundry/bin"
RPC="https://rpc.moderato.tempo.xyz"
DEVLOG="/tmp/legato-e2e-dev.log"
# Two deposits (2 + 3 = 5 total) exercise the multi-note case; the withdrawal of 4 spans BOTH notes.
WITHDRAW_AMOUNT=4; EXPECTED_NOTES=2; EXPECTED_SPENT=2
export WITHDRAW_AMOUNT EXPECTED_NOTES EXPECTED_SPENT

echo "════════════════════════════ Legato Shielded E2E ════════════════════════════"

if [ ! -f ../contracts/.env ]; then echo "FATAL: ../contracts/.env missing"; exit 1; fi
set -a; . ../contracts/.env; set +a
OWNER_KEY="${PRIVATE_KEY:-}"
[ -n "$OWNER_KEY" ] || { echo "FATAL: PRIVATE_KEY not set in ../contracts/.env"; exit 1; }

EMP_KEY=$(node -e "const{generatePrivateKey}=require('viem/accounts');console.log(generatePrivateKey())")
EMP_ADDR=$(node -e "const{privateKeyToAccount}=require('viem/accounts');console.log(privateKeyToAccount('$EMP_KEY').address)")
export EMPLOYEE_ADDRESS="$EMP_ADDR"
echo "Employee (this run): $EMP_ADDR"

# Tempo pays gas in pathUSD. The employee signs two txs (register + withdraw), so
# fund the fresh address with pathUSD for gas.
PATH_USD=0x20C0000000000000000000000000000000000000
echo "Funding employee with pathUSD for gas..."
cast send "$PATH_USD" "transfer(address,uint256)" "$EMP_ADDR" 200000000 \
  --private-key "$OWNER_KEY" --rpc-url "$RPC" >/dev/null 2>&1 \
  || { echo "FATAL: pathUSD gas funding failed"; exit 1; }

start_server() {  # $1 = dev connector key, $2 = route to pre-warm
  printf 'NEXT_PUBLIC_DEV_PRIVATE_KEY=%s\n' "$1" > .env.local
  rm -rf .next
  npm run dev > "$DEVLOG" 2>&1 &
  for i in $(seq 1 90); do
    curl -sk -o /dev/null --max-time 2 https://localhost:3000 && break
    sleep 1
    [ "$i" = 90 ] && { echo "FATAL: dev server not ready (see $DEVLOG)"; return 1; }
  done
  curl -sk -o /dev/null --max-time 90 "https://localhost:3000${2:-/}"
  return 0
}
stop_server() {
  pkill -f "next dev --experimental-https" 2>/dev/null
  for i in $(seq 1 30); do
    curl -sk -o /dev/null --max-time 1 https://localhost:3000 2>/dev/null || return 0
    sleep 1
  done
}

run_phase() {  # $1 = key, $2 = route, $3 = script, $4 = label
  echo "──────────────── $4 phase ────────────────"
  start_server "$1" "$2" || { rm -f .env.local; exit 1; }
  node "tests/e2e/$3"; local prc=$?
  stop_server
  return $prc
}

rc=0
stop_server

run_phase "$EMP_KEY" /claim register.mjs "REGISTER" || rc=1
[ "$rc" -eq 0 ] && { SALARY=2; export SALARY; run_phase "$OWNER_KEY" /admin deposit.mjs "DEPOSIT-1" || rc=1; }
[ "$rc" -eq 0 ] && { SALARY=3; export SALARY; run_phase "$OWNER_KEY" /admin deposit.mjs "DEPOSIT-2" || rc=1; }
[ "$rc" -eq 0 ] && { run_phase "$EMP_KEY" /claim withdraw.mjs "WITHDRAW" || rc=1; }

rm -f .env.local
echo "═════════════════════════════════════════════════════════════════════════════"
[ "$rc" -eq 0 ] && echo "E2E RESULT: ✅ PASS" || echo "E2E RESULT: ❌ FAIL"
exit $rc
