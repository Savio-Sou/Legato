"use client";

import { useState } from "react";
import Link from "next/link";
import {
  useAccount,
  useConfig,
  useWriteContract,
} from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { parseUnits } from "viem";
import { ConnectPanel, WalletBadge } from "@/components/wallet";
import {
  PAYROLL_MANAGER_ADDRESS,
  PATH_USD_ADDRESS,
  PAYROLL_MANAGER_ABI,
  ERC20_ABI,
} from "@/lib/contracts";

interface EmployeeRow {
  address: string;
  salaryUsd: string;
}

const EMPTY_ROW: EmployeeRow = { address: "", salaryUsd: "" };

const CheckIcon = () => (
  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
  </svg>
);

// Spinning circle shown on the step currently in progress.
const Spinner = () => (
  <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
    <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z" />
  </svg>
);

// Key glyph marking a step that needs a passkey signature.
const KeyIcon = () => (
  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1 1 21.75 8.25Z"
    />
  </svg>
);

const STEP_ORDER = ["idle", "building", "approving", "activating", "done"] as const;
type Step = typeof STEP_ORDER[number];

export default function AdminPage() {
  const { address, isConnected } = useAccount();

  const [rows, setRows] = useState<EmployeeRow[]>([{ ...EMPTY_ROW }]);
  const [status, setStatus] = useState<string>("");
  const [treeRoot, setTreeRoot] = useState<string | null>(null);
  const [fundAmount, setFundAmount] = useState("5000");
  const [step, setStep] = useState<Step>("idle");
  const [linkCopied, setLinkCopied] = useState(false);

  const { writeContractAsync } = useWriteContract();
  const config = useConfig();

  function addRow() {
    if (rows.length < 5) setRows((r) => [...r, { ...EMPTY_ROW }]);
  }
  function removeRow(i: number) {
    setRows((r) => r.filter((_, idx) => idx !== i));
  }
  function updateRow(i: number, field: keyof EmployeeRow, value: string) {
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, [field]: value } : row)));
  }

  async function handleBuildAndDeploy() {
    if (!isConnected || !address) return;

    const filledRows = rows.filter((r) => r.address && r.salaryUsd);
    if (filledRows.length === 0) {
      setStatus("Add at least one employee with an address and salary.");
      return;
    }

    const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/i;
    for (const r of filledRows) {
      if (!ADDRESS_RE.test(r.address)) {
        setStatus(`Invalid address: ${r.address}`);
        return;
      }
      if (Number(r.salaryUsd) <= 0) {
        setStatus(`Salary must be greater than 0 for ${r.address.slice(0, 8)}…`);
        return;
      }
    }

    const addressSet = new Set<string>();
    for (const r of filledRows) {
      const lower = r.address.toLowerCase();
      if (addressSet.has(lower)) {
        setStatus(`Duplicate address: ${r.address.slice(0, 8)}…`);
        return;
      }
      addressSet.add(lower);
    }

    setStep("building");
    setStatus("Building Merkle tree on server…");

    const buildRes = await fetch("/api/payroll", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employer: address,
        employees: rows
          .filter((r) => r.address && r.salaryUsd)
          .map((r) => ({
            address: r.address,
            salary: parseUnits(r.salaryUsd, 6).toString(),
          })),
      }),
    });

    if (!buildRes.ok) {
      const err = await buildRes.json();
      setStatus("Error: " + (err.error ?? "unknown"));
      setStep("idle");
      return;
    }

    const { root } = await buildRes.json();
    setTreeRoot(root);
    setStatus("Tree built — root: " + root.slice(0, 10) + "…");

    setStep("approving");
    const totalWei = parseUnits(fundAmount, 6);
    setStatus("Signature 1 of 2 — approve the passkey prompt to let the payroll contract use your pathUSD.");
    try {
      const approveHash = await writeContractAsync({
        address: PATH_USD_ADDRESS,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [PAYROLL_MANAGER_ADDRESS, totalWei],
      });
      // Wait for the allowance to be mined before fund() — otherwise fund's
      // transferFrom is estimated against zero allowance and reverts.
      setStatus("Approval signed — waiting for it to confirm on-chain…");
      await waitForTransactionReceipt(config, { hash: approveHash });
    } catch (e) {
      setStatus("Approval failed: " + (e instanceof Error ? e.message : String(e)));
      setStep("idle");
      return;
    }

    setStep("activating");
    setStatus("Signature 2 of 2 — approve the passkey prompt to publish your root and fund the payroll.");
    try {
      const setupHash = await writeContractAsync({
        address: PAYROLL_MANAGER_ADDRESS,
        abi: PAYROLL_MANAGER_ABI,
        functionName: "createAndFund",
        args: [root as `0x${string}`, totalWei],
      });
      setStatus("Setup signed — waiting for it to confirm on-chain…");
      await waitForTransactionReceipt(config, { hash: setupHash });
    } catch (e) {
      setStatus("Payroll setup failed: " + (e instanceof Error ? e.message : String(e)));
      setStep("idle");
      return;
    }

    setStep("done");
    setStatus("Payroll is live — Merkle root anchored on Tempo.");
  }

  const currentIdx = STEP_ORDER.indexOf(step);
  const isError = status.startsWith("Error") || status.includes("failed");

  // Per-step copy for the progress tracker. `sig` is the passkey-signature
  // number (null for steps that don't touch the wallet), so the UI can spell
  // out exactly what the employer is being asked to sign.
  const amt = fundAmount || "0";
  const flowSteps = [
    {
      id: "building",
      label: "Build Merkle tree",
      desc: "Hashes your employee list into a single root commitment on the server. No wallet signature.",
      sig: null as number | null,
    },
    {
      id: "approving",
      label: "Approve pathUSD",
      desc: `Authorizes the payroll contract to pull ${amt} pathUSD from your wallet. No funds move yet — this just grants the allowance.`,
      sig: 1 as number | null,
    },
    {
      id: "activating",
      label: "Create & fund payroll",
      desc: `Publishes your Merkle root on-chain and transfers ${amt} pathUSD into the contract in one transaction.`,
      sig: 2 as number | null,
    },
  ];

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  // The claim link points at this specific payroll by its Merkle root, so an
  // employer who runs several payrolls gets a distinct link for each.
  const claimLink = treeRoot ? `${origin}/claim?payroll=${treeRoot}` : "";

  async function copyClaimLink() {
    try {
      await navigator.clipboard.writeText(claimLink);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 1500);
    } catch {
      // Clipboard can be unavailable (e.g. insecure context); fail quietly.
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/80 backdrop-blur-sm px-6 py-4 flex items-center justify-between">
        <Link href="/" className="text-sm text-neutral-600 hover:text-neutral-900 transition-colors">
          ← Legato
        </Link>
        <span className="font-semibold text-neutral-900">HR Admin</span>
        <WalletBadge />
      </header>

      <main className="flex-1 max-w-2xl mx-auto w-full px-6 py-12 space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Set up payroll</h1>
          <p className="text-sm text-neutral-600 mt-1.5 leading-relaxed">
            Enter up to 5 employee addresses and their monthly salary in pathUSD.
          </p>
        </div>

        {/* Employee rows */}
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
            <button
              onClick={addRow}
              className="text-sm font-medium text-emerald-700 hover:text-emerald-800 transition-colors"
            >
              + Add employee
            </button>
          )}
        </div>

        {/* Merkle root display */}
        {treeRoot && (
          <div className="rounded-lg border border-emerald-600/20 bg-emerald-500/5 p-4 space-y-1">
            <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">Merkle Root</p>
            <p className="text-sm font-mono break-all text-emerald-700">{treeRoot}</p>
          </div>
        )}

        {/* Fund amount */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-neutral-600 block">
            Total pathUSD to pre-fund the contract
          </label>
          <div className="flex items-center gap-2.5">
            <input
              type="number"
              min="0"
              value={fundAmount}
              onChange={(e) => setFundAmount(e.target.value)}
              className="w-48 rounded-lg border border-neutral-300 bg-white px-3.5 py-2.5 text-sm text-neutral-900 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none transition-all"
            />
            <span className="text-sm text-neutral-500">pathUSD</span>
          </div>
        </div>

        {/* Primary action */}
        <div className="space-y-4">
          {!isConnected ? (
            <ConnectPanel note="Connect with a passkey to set up your payroll. Anyone can run their own — no contract owner required." />
          ) : (
            <button
              onClick={handleBuildAndDeploy}
              disabled={step !== "idle" && step !== "done"}
              className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-neutral-200 disabled:text-neutral-400 disabled:cursor-not-allowed px-6 py-3.5 text-sm font-semibold text-white shadow-sm disabled:shadow-none transition-all active:scale-[0.99] disabled:active:scale-100"
            >
              {step === "idle"
                ? "Build tree & activate payroll"
                : step === "done"
                ? "Payroll live ✓"
                : "Processing…"}
            </button>
          )}

          {status && (
            <div
              className={`rounded-lg border px-4 py-3 text-sm transition-colors ${
                step === "done"
                  ? "border-emerald-600/30 bg-emerald-500/10 text-emerald-700"
                  : isError
                  ? "border-red-500/30 bg-red-50 text-red-700"
                  : "border-neutral-200 bg-white text-neutral-700"
              }`}
            >
              {status}
            </div>
          )}

          {/* Shareable employee claim link */}
          {step === "done" && treeRoot && (
            <div className="rounded-lg border border-emerald-600/20 bg-emerald-500/5 p-4 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
                Employee claim link
              </p>
              <p className="text-sm text-neutral-600 leading-relaxed">
                Share this link with your employees — it points them at{" "}
                <span className="font-medium">your</span> payroll so they can claim.
              </p>
              <div className="flex gap-2 items-center">
                <input
                  readOnly
                  value={claimLink}
                  onFocus={(e) => e.target.select()}
                  className="flex-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs font-mono text-neutral-700 focus:border-emerald-500 focus:outline-none"
                />
                <button
                  onClick={copyClaimLink}
                  className="rounded-lg border border-neutral-300 bg-white hover:border-emerald-500 hover:text-emerald-700 px-3.5 py-2 text-xs font-medium text-neutral-700 transition-all flex-shrink-0"
                >
                  {linkCopied ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Progress steps */}
        {step !== "idle" && (
          <div className="rounded-xl border border-neutral-200 bg-white p-5 space-y-4 shadow-sm">
            <div className="flex items-baseline justify-between">
              <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">Progress</p>
              <p className="text-xs text-neutral-400">2 passkey signatures</p>
            </div>
            {flowSteps.map(({ id, label, desc, sig }, i) => {
              const itemIdx = STEP_ORDER.indexOf(id as Step);
              const isDone = currentIdx > itemIdx;
              const isActive = step === id;
              return (
                <div key={id} className="flex items-start gap-3">
                  <span
                    className={`mt-0.5 w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold transition-all ${
                      isDone
                        ? "bg-emerald-500/15 border border-emerald-600/50 text-emerald-700"
                        : isActive
                        ? "bg-emerald-500/15 border border-emerald-600 text-emerald-700"
                        : "border border-neutral-300 text-neutral-400"
                    }`}
                  >
                    {isDone ? <CheckIcon /> : isActive ? <Spinner /> : i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`text-sm transition-colors ${
                          isDone
                            ? "text-neutral-400 line-through"
                            : isActive
                            ? "text-neutral-900 font-medium"
                            : "text-neutral-500"
                        }`}
                      >
                        {label}
                      </span>
                      {sig !== null && (
                        <span
                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide transition-colors ${
                            isActive
                              ? "border-amber-300 bg-amber-50 text-amber-700"
                              : isDone
                              ? "border-emerald-600/30 bg-emerald-500/5 text-emerald-700"
                              : "border-neutral-200 bg-neutral-50 text-neutral-400"
                          }`}
                        >
                          <KeyIcon />
                          Passkey {sig} of 2
                        </span>
                      )}
                    </div>
                    <p
                      className={`text-xs leading-relaxed mt-0.5 transition-colors ${
                        isActive ? "text-neutral-600" : "text-neutral-400"
                      }`}
                    >
                      {desc}
                    </p>
                    {isActive && sig !== null && (
                      <p className="text-xs font-medium text-amber-700 mt-1">
                        Check your device and approve the passkey prompt to sign.
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
