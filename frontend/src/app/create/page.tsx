"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAccount, useConfig, usePublicClient, useWriteContract } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { parseUnits } from "viem";
import { WalletBadge } from "@/components/wallet";
import { Lockup } from "@/components/brand";
import { ErrorCard } from "@/components/error-card";
import { friendlyError, plainError, type FriendlyError } from "@/lib/errors";
import { withAutoFunding } from "@/lib/faucet";
import {
  SHIELDED_POOL_ADDRESS,
  SHIELDED_POOL_ABI,
  PATH_USD_ADDRESS,
  ERC20_ABI,
  PATH_USD_DECIMALS,
} from "@/lib/contracts";
import { getRegisteredKey } from "@/lib/pool";
import { proveDeposit } from "@/lib/noir";
import { encryptNote, randomBlinding } from "@/lib/notes";

interface EmployeeRow {
  address: string;
  salaryUsd: string;
}
const EMPTY_ROW: EmployeeRow = { address: "", salaryUsd: "" };
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/i;

type Phase =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "funding" }
  | { kind: "approving" }
  | { kind: "depositing"; index: number; total: number; label: string }
  | { kind: "done"; count: number }
  | { kind: "error"; error: FriendlyError };

export default function CreatePage() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const config = useConfig();
  const { writeContractAsync } = useWriteContract();

  const [rows, setRows] = useState<EmployeeRow[]>([{ ...EMPTY_ROW }]);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });

  // Per-address shielded-key registration status, keyed by lowercased address.
  // Populated lazily as valid addresses are typed; cached so each address is checked once.
  type RegStatus = "checking" | "registered" | "unregistered";
  const [regStatus, setRegStatus] = useState<Record<string, RegStatus>>({});
  // Addresses whose check has already been kicked off — keeps the effect from
  // re-firing for them without putting `regStatus` in the dependency array.
  const checkedRef = useRef<Set<string>>(new Set());

  // Origin the site is served from, e.g. "https://legato.example.com" — set
  // client-side to avoid a hydration mismatch, then woven into the registration prompt.
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);

  useEffect(() => {
    if (!publicClient) return;
    const pending = [
      ...new Set(
        rows
          .map((r) => r.address.trim().toLowerCase())
          .filter((a) => ADDRESS_RE.test(a) && !checkedRef.current.has(a)),
      ),
    ];
    if (pending.length === 0) return;

    for (const a of pending) checkedRef.current.add(a);
    setRegStatus((s) => {
      const next = { ...s };
      for (const a of pending) next[a] = "checking";
      return next;
    });

    for (const a of pending) {
      getRegisteredKey(publicClient, a)
        .then((key) => {
          setRegStatus((s) => ({ ...s, [a]: key ? "registered" : "unregistered" }));
        })
        .catch(() => {
          // Network/read error — drop from caches so it retries on a later render.
          checkedRef.current.delete(a);
          setRegStatus((s) => {
            const next = { ...s };
            delete next[a];
            return next;
          });
        });
    }
  }, [rows, publicClient]);

  const busy =
    phase.kind === "checking" ||
    phase.kind === "funding" ||
    phase.kind === "approving" ||
    phase.kind === "depositing";

  // Every row must carry a valid, registered address and a positive salary, with no
  // duplicate addresses — otherwise the submit button stays disabled.
  const addresses = rows.map((r) => r.address.trim().toLowerCase());
  const formValid =
    rows.length > 0 &&
    new Set(addresses).size === rows.length &&
    rows.every((r, i) => {
      const a = addresses[i];
      return ADDRESS_RE.test(a) && regStatus[a] === "registered" && Number(r.salaryUsd) > 0;
    });

  function addRow() {
    if (rows.length < 5) setRows((r) => [...r, { ...EMPTY_ROW }]);
  }
  function removeRow(i: number) {
    setRows((r) => r.filter((_, idx) => idx !== i));
  }
  function updateRow(i: number, field: keyof EmployeeRow, value: string) {
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, [field]: value } : row)));
  }

  async function handleDeposit() {
    if (!isConnected || !address || !publicClient) return;

    const filled = rows.filter((r) => r.address && r.salaryUsd);
    if (filled.length === 0) {
      setPhase({ kind: "error", error: plainError("Nothing to fund", "Add at least one employee with an address and salary.") });
      return;
    }
    const seen = new Set<string>();
    for (const r of filled) {
      if (!ADDRESS_RE.test(r.address))
        return setPhase({ kind: "error", error: plainError("Invalid address", `${r.address} isn't a valid 0x address.`) });
      if (Number(r.salaryUsd) <= 0)
        return setPhase({ kind: "error", error: plainError("Invalid salary", `Salary must be greater than 0 for ${r.address.slice(0, 8)}….`) });
      const low = r.address.toLowerCase();
      if (seen.has(low))
        return setPhase({ kind: "error", error: plainError("Duplicate address", `${r.address.slice(0, 8)}… appears more than once.`) });
      seen.add(low);
    }

    // 1) Resolve each employee's registered shielded key (they must register first via /claim).
    setPhase({ kind: "checking" });
    const employees: { address: string; salary: bigint; pk: bigint; encPub: [bigint, bigint] }[] = [];
    const unregistered: string[] = [];
    for (const r of filled) {
      const key = await getRegisteredKey(publicClient, r.address);
      if (!key) unregistered.push(r.address);
      else employees.push({ address: r.address, salary: parseUnits(r.salaryUsd, PATH_USD_DECIMALS), pk: key.pk, encPub: key.encPub });
    }
    if (unregistered.length > 0) {
      setPhase({
        kind: "error",
        error: plainError(
          "Employees not registered yet",
          "These addresses must open /claim and register a shielded key first: " +
            unregistered.map((a) => a.slice(0, 8) + "…").join(", "),
        ),
      });
      return;
    }

    const total = employees.reduce((s, e) => s + e.salary, 0n);

    // 2) Approve the pool to pull the total pathUSD. This is the first signed
    // tx, so if the wallet has no gas it auto-funds here and retries.
    setPhase({ kind: "approving" });
    try {
      await withAutoFunding(
        async () => {
          const hash = await writeContractAsync({
            address: PATH_USD_ADDRESS,
            abi: ERC20_ABI,
            functionName: "approve",
            args: [SHIELDED_POOL_ADDRESS, total],
          });
          await waitForTransactionReceipt(config, { hash });
        },
        { client: publicClient, address, onFunding: () => setPhase({ kind: "funding" }) },
      );
    } catch (e) {
      return setPhase({ kind: "error", error: friendlyError(e, "Approval failed") });
    }

    // 3) One encrypted deposit per employee (each binds value↔commitment via a deposit proof).
    for (let i = 0; i < employees.length; i++) {
      const e = employees[i];
      try {
        setPhase({ kind: "depositing", index: i, total: employees.length, label: "Generating deposit proof…" });
        const blinding = randomBlinding();
        const dep = await proveDeposit(e.salary, e.pk, blinding);
        const enc = await encryptNote(e.encPub, e.salary, blinding);

        setPhase({ kind: "depositing", index: i, total: employees.length, label: "Submitting deposit…" });
        await withAutoFunding(
          async () => {
            const hash = await writeContractAsync({
              address: SHIELDED_POOL_ADDRESS,
              abi: SHIELDED_POOL_ABI,
              functionName: "deposit",
              args: [dep.proof, dep.publicInputs, enc.ephPubkey, enc.ciphertext, enc.tag],
            });
            await waitForTransactionReceipt(config, { hash });
          },
          { client: publicClient, address, onFunding: () => setPhase({ kind: "funding" }) },
        );
      } catch (err) {
        return setPhase({ kind: "error", error: friendlyError(err, `Deposit for ${e.address.slice(0, 8)}… failed`) });
      }
    }

    setPhase({ kind: "done", count: employees.length });
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/80 backdrop-blur-sm px-6 py-3.5 flex items-center justify-between">
        <Link href="/" aria-label="Legato home" className="transition-opacity hover:opacity-80">
          <Lockup size="text-base" />
        </Link>
        <WalletBadge />
      </header>

      <main className="flex-1 max-w-2xl mx-auto w-full px-6 py-12 space-y-8">
        <div>
          <h1 className="text-3xl font-display font-semibold tracking-tight text-neutral-900">Fund payroll privately</h1>
          <p className="text-sm text-neutral-600 mt-1.5 leading-relaxed">
            Deposit each salary into the shared shielded pool as an encrypted note. The amounts you fund
            are visible, but <span className="font-medium">who they belong to never appears on-chain</span> —
            employees withdraw later, unlinked to this payroll.
          </p>
        </div>

        <div className="space-y-3">
          {rows.map((row, i) => {
            const normalized = row.address.trim().toLowerCase();
            const status = ADDRESS_RE.test(normalized) ? regStatus[normalized] : undefined;
            return (
              <div key={i} className="space-y-1.5">
                <div className="flex gap-2.5 items-center">
                  <input
                    placeholder="Employee address (0x…)"
                    value={row.address}
                    onChange={(e) => updateRow(i, "address", e.target.value)}
                    className="flex-1 rounded-lg border border-neutral-300 bg-white px-3.5 py-2.5 text-sm font-mono text-neutral-900 placeholder:text-neutral-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none transition-all"
                  />
                  <input
                    placeholder="Salary (USD)"
                    type="number"
                    min="0"
                    value={row.salaryUsd}
                    onChange={(e) => updateRow(i, "salaryUsd", e.target.value)}
                    className="w-36 rounded-lg border border-neutral-300 bg-white px-3.5 py-2.5 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none transition-all"
                  />
                  {rows.length > 1 && (
                    <button
                      onClick={() => removeRow(i)}
                      className="w-9 h-9 rounded-md border border-neutral-300 bg-white hover:border-red-400 hover:bg-red-50 hover:text-red-600 text-neutral-400 flex items-center justify-center text-lg leading-none transition-all flex-shrink-0"
                      aria-label="Remove"
                    >
                      ×
                    </button>
                  )}
                </div>
                {status === "unregistered" && (
                  <p className="flex items-start gap-1.5 text-xs text-amber-700 leading-relaxed">
                    <svg className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                    </svg>
                    <span>
                      No shielded key registered for this address yet. Invite the employee to first
                      register on <span className="font-mono">{origin}/claim</span>.
                    </span>
                  </p>
                )}
                {status === "checking" && (
                  <p className="text-xs text-neutral-400 leading-relaxed">Checking shielded-key registration…</p>
                )}
              </div>
            );
          })}
          {rows.length < 5 && (
            <button onClick={addRow} className="text-sm font-medium text-emerald-700 hover:text-emerald-800 transition-colors">
              + Add employee
            </button>
          )}
        </div>

        <div className="space-y-4">
          {!isConnected ? (
            <div className="flex items-center gap-3 rounded-xl border border-dashed border-neutral-300 bg-white/60 p-5 text-sm text-neutral-600 shadow-sm">
              <svg className="h-5 w-5 flex-shrink-0 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 16.5 16.5 7.5m0 0H9m7.5 0V15" />
              </svg>
              <span>
                Connect a passkey wallet to fund payroll — use{" "}
                <span className="font-medium text-neutral-900">Connect wallet</span> in the top-right.
              </span>
            </div>
          ) : (
            <button
              onClick={handleDeposit}
              disabled={busy || !formValid}
              className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-neutral-200 disabled:text-neutral-400 disabled:cursor-not-allowed px-6 py-3.5 text-sm font-semibold text-white shadow-sm disabled:shadow-none transition-all active:scale-[0.99] disabled:active:scale-100"
            >
              {phase.kind === "checking"
                ? "Checking employee keys…"
                : phase.kind === "funding"
                ? "Topping up testnet funds…"
                : phase.kind === "approving"
                ? "Approve pathUSD in your wallet…"
                : phase.kind === "depositing"
                ? `Depositing ${phase.index + 1} of ${phase.total}…`
                : phase.kind === "done"
                ? "Deposit again"
                : "Create and fund payroll"}
            </button>
          )}

          {phase.kind === "depositing" && (
            <div className="rounded-lg border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-700">
              Employee {phase.index + 1} / {phase.total}: {phase.label}
            </div>
          )}

          {phase.kind === "error" && (
            <ErrorCard error={phase.error} onRetry={() => setPhase({ kind: "idle" })} />
          )}

          {phase.kind === "done" && (
            <div className="rounded-lg border border-emerald-600/20 bg-emerald-500/5 p-4 space-y-2">
              <p className="text-sm font-medium text-emerald-700">
                {phase.count} encrypted {phase.count === 1 ? "note" : "notes"} deposited into the pool
              </p>
              <p className="text-sm text-neutral-600 leading-relaxed">
                Your employees can now claim their salaries on{" "}
                <a
                  href="/claim"
                  className="font-mono text-emerald-700 underline underline-offset-2 hover:text-emerald-800"
                >
                  {typeof window !== "undefined" ? window.location.origin : ""}/claim
                </a>
                .
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
