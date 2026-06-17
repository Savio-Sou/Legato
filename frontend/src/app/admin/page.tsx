"use client";

import { useState } from "react";
import Link from "next/link";
import { useAccount, useConfig, usePublicClient, useWriteContract } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { parseUnits } from "viem";
import { WalletBadge } from "@/components/wallet";
import { Lockup } from "@/components/brand";
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
  | { kind: "approving" }
  | { kind: "depositing"; index: number; total: number; label: string }
  | { kind: "done"; count: number }
  | { kind: "error"; message: string };

export default function AdminPage() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const config = useConfig();
  const { writeContractAsync } = useWriteContract();

  const [rows, setRows] = useState<EmployeeRow[]>([{ ...EMPTY_ROW }]);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });

  const busy =
    phase.kind === "checking" || phase.kind === "approving" || phase.kind === "depositing";

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
      setPhase({ kind: "error", message: "Add at least one employee with an address and salary." });
      return;
    }
    const seen = new Set<string>();
    for (const r of filled) {
      if (!ADDRESS_RE.test(r.address))
        return setPhase({ kind: "error", message: `Invalid address: ${r.address}` });
      if (Number(r.salaryUsd) <= 0)
        return setPhase({ kind: "error", message: `Salary must be > 0 for ${r.address.slice(0, 8)}…` });
      const low = r.address.toLowerCase();
      if (seen.has(low)) return setPhase({ kind: "error", message: `Duplicate address: ${r.address.slice(0, 8)}…` });
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
        message:
          "These employees haven't registered a shielded key yet (they must open /claim and register first): " +
          unregistered.map((a) => a.slice(0, 8) + "…").join(", "),
      });
      return;
    }

    const total = employees.reduce((s, e) => s + e.salary, 0n);

    // 2) Approve the pool to pull the total pathUSD.
    setPhase({ kind: "approving" });
    try {
      const hash = await writeContractAsync({
        address: PATH_USD_ADDRESS,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [SHIELDED_POOL_ADDRESS, total],
      });
      await waitForTransactionReceipt(config, { hash });
    } catch (e) {
      return setPhase({ kind: "error", message: "Approval failed: " + msg(e) });
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
        const hash = await writeContractAsync({
          address: SHIELDED_POOL_ADDRESS,
          abi: SHIELDED_POOL_ABI,
          functionName: "deposit",
          args: [dep.proof, dep.publicInputs, enc.ephPubkey, enc.ciphertext, enc.tag],
        });
        await waitForTransactionReceipt(config, { hash });
      } catch (err) {
        return setPhase({ kind: "error", message: `Deposit for ${e.address.slice(0, 8)}… failed: ` + msg(err) });
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
        <span className="text-sm font-medium text-neutral-500">HR Admin</span>
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
          <p className="text-xs text-neutral-500 mt-2 leading-relaxed">
            Employees must open <span className="font-mono">/claim</span> and register a shielded key first,
            then share their address with you.
          </p>
        </div>

        <div className="space-y-3">
          {rows.map((row, i) => (
            <div key={i} className="flex gap-2.5 items-center">
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
          ))}
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
                <span className="font-medium text-neutral-900">Connect wallet</span> in the top-right. The
                pool is shared and permissionless.
              </span>
            </div>
          ) : (
            <button
              onClick={handleDeposit}
              disabled={busy}
              className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-neutral-200 disabled:text-neutral-400 disabled:cursor-not-allowed px-6 py-3.5 text-sm font-semibold text-white shadow-sm disabled:shadow-none transition-all active:scale-[0.99] disabled:active:scale-100"
            >
              {phase.kind === "checking"
                ? "Checking employee keys…"
                : phase.kind === "approving"
                ? "Approve pathUSD in your wallet…"
                : phase.kind === "depositing"
                ? `Depositing ${phase.index + 1} of ${phase.total}…`
                : phase.kind === "done"
                ? "Deposit again"
                : "Fund payroll into the pool"}
            </button>
          )}

          {phase.kind === "depositing" && (
            <div className="rounded-lg border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-700">
              Employee {phase.index + 1} / {phase.total}: {phase.label}
            </div>
          )}

          {phase.kind === "error" && (
            <div className="rounded-lg border border-red-500/30 bg-red-50 px-4 py-3 text-sm text-red-700 space-y-2">
              <p className="leading-relaxed">{phase.message}</p>
              <button onClick={() => setPhase({ kind: "idle" })} className="text-xs text-neutral-500 hover:text-neutral-700">
                ← Try again
              </button>
            </div>
          )}

          {phase.kind === "done" && (
            <div className="rounded-lg border border-emerald-600/20 bg-emerald-500/5 p-4 space-y-2">
              <p className="text-sm font-medium text-emerald-700">
                {phase.count} encrypted {phase.count === 1 ? "note" : "notes"} deposited into the pool ✓
              </p>
              <p className="text-sm text-neutral-600 leading-relaxed">
                Tell your employees to open <span className="font-mono">/claim</span> and withdraw —
                their browser scans the pool, decrypts their note, and proves ownership to withdraw any
                amount. No claim link needed; the pool is shared.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
