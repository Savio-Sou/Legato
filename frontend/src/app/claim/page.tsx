"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  useAccount,
  useConfig,
  useReadContract,
  useWriteContract,
} from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { formatUnits } from "viem";
import { generatePayrollProof, type ProofStatus } from "@/lib/noir";
import type { MerklePath } from "@/lib/merkle";
import { ConnectPanel, WalletBadge } from "@/components/wallet";
import {
  PAYROLL_MANAGER_ADDRESS,
  PAYROLL_MANAGER_ABI,
} from "@/lib/contracts";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;
const ZERO_ROOT = ("0x" + "0".repeat(64)) as `0x${string}`;
// A payroll is identified by its Merkle root (a 32-byte hex value).
const ROOT_RE = /^0x[0-9a-fA-F]{64}$/;

type ClaimState =
  | { phase: "idle" }
  | { phase: "fetching_path" }
  | { phase: "proving"; proofStatus: ProofStatus }
  | { phase: "claiming" }
  | { phase: "claimed"; amount: bigint }
  | { phase: "error"; message: string };

function proofStageLabel(s: ProofStatus): string {
  switch (s.stage) {
    case "loading": return "Loading circuit WASM…";
    case "executing_witness": return "Executing witness — computing Merkle path…";
    case "generating_proof": return "Generating ZK proof — this takes 10–30 s…";
    case "done": return "Proof ready!";
    case "error": return "Error: " + s.message;
  }
}

function proofStageProgress(s: ProofStatus): number {
  switch (s.stage) {
    case "loading": return 15;
    case "executing_witness": return 40;
    case "generating_proof": return 70;
    case "done": return 100;
    default: return 0;
  }
}

function ClaimHeader() {
  return (
    <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/80 backdrop-blur-sm px-6 py-4 flex items-center justify-between">
      <Link href="/" className="text-sm text-neutral-600 hover:text-neutral-900 transition-colors">
        ← Legato
      </Link>
      <span className="font-semibold text-neutral-900">Claim Salary</span>
      <WalletBadge />
    </header>
  );
}

function ClaimContent() {
  const searchParams = useSearchParams();
  const payrollParam = searchParams.get("payroll");
  const payroll =
    payrollParam && ROOT_RE.test(payrollParam) ? (payrollParam as `0x${string}`) : null;

  const { address, isConnected } = useAccount();
  const [state, setState] = useState<ClaimState>({ phase: "idle" });

  // Payroll summary by Merkle root: [owner, balance, active]
  const { data: payrollData } = useReadContract({
    address: PAYROLL_MANAGER_ADDRESS,
    abi: PAYROLL_MANAGER_ABI,
    functionName: "getPayroll",
    args: [payroll ?? ZERO_ROOT],
    query: { enabled: isConnected && !!payroll },
  });
  const payrollActive = payrollData?.[2] as boolean | undefined;

  const { data: hasClaimed, refetch: refetchClaimed } = useReadContract({
    address: PAYROLL_MANAGER_ADDRESS,
    abi: PAYROLL_MANAGER_ABI,
    functionName: "hasClaimed",
    args: [payroll ?? ZERO_ROOT, address ?? ZERO_ADDRESS],
    query: { enabled: isConnected && !!address && !!payroll },
  });

  const { writeContractAsync } = useWriteContract();
  const config = useConfig();

  async function handleClaim() {
    if (!address || !payroll) return;

    setState({ phase: "fetching_path" });

    let merklePath: MerklePath;
    let salary: bigint;
    let rootHex: string;
    try {
      const res = await fetch(
        `/api/payroll/path?payroll=${payroll}&address=${address}`
      );
      if (!res.ok) {
        const err = await res.json();
        setState({ phase: "error", message: err.error ?? "Not on payroll" });
        return;
      }
      const data = await res.json();
      salary = BigInt(data.salary);
      // Use the canonical root the tree actually hashes to for proof generation.
      rootHex = data.root as string;
      merklePath = {
        leaf: data.leaf,
        leafIndex: data.leafIndex,
        siblings: data.siblings,
        pathIndices: data.pathIndices,
      };
    } catch (e) {
      setState({
        phase: "error",
        message: "Failed to fetch Merkle path: " + (e instanceof Error ? e.message : String(e)),
      });
      return;
    }

    setState({ phase: "proving", proofStatus: { stage: "loading" } });

    let proofResult: Awaited<ReturnType<typeof generatePayrollProof>>;
    try {
      proofResult = await generatePayrollProof(
        address,
        salary,
        rootHex,
        merklePath,
        (proofStatus) => setState({ phase: "proving", proofStatus })
      );
    } catch (e) {
      setState({
        phase: "error",
        message: "Proof generation failed: " + (e instanceof Error ? e.message : String(e)),
      });
      return;
    }

    // Dev/test only: expose the exact proof + public inputs so the E2E harness
    // can simulate verify()/claim() off-chain. Stripped from production builds.
    if (process.env.NEXT_PUBLIC_DEV_PRIVATE_KEY) {
      (window as unknown as Record<string, unknown>).__claimDebug = {
        proof: proofResult.proof,
        pub: proofResult.publicInputs,
        root: rootHex,
        payroll,
      };
    }

    setState({ phase: "claiming" });
    try {
      const claimHash = await writeContractAsync({
        address: PAYROLL_MANAGER_ADDRESS,
        abi: PAYROLL_MANAGER_ABI,
        functionName: "claim",
        args: [proofResult.proof, proofResult.publicInputs],
      });
      // Only show success once the claim is actually mined on-chain.
      await waitForTransactionReceipt(config, { hash: claimHash });
      await refetchClaimed();
      setState({ phase: "claimed", amount: salary });
    } catch (e) {
      if (process.env.NEXT_PUBLIC_DEV_PRIVATE_KEY) {
        const err = e as { shortMessage?: string; details?: string; name?: string; cause?: { shortMessage?: string; message?: string; details?: string } };
        // Dev/test only: structured error (sans the giant calldata) for the E2E harness.
        (window as unknown as Record<string, unknown>).__claimError = {
          name: err?.name,
          shortMessage: err?.shortMessage,
          details: err?.details,
          causeShort: err?.cause?.shortMessage ?? err?.cause?.message,
          causeDetails: err?.cause?.details,
        };
      }
      setState({
        phase: "error",
        message: "Claim transaction failed: " + (e instanceof Error ? e.message : String(e)),
      });
    }
  }

  // No payroll in the URL → the visitor followed a bare /claim. Tell them they
  // need the link their employer generated.
  if (!payroll) {
    return (
      <main className="flex-1 max-w-lg mx-auto w-full px-6 py-12 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Claim your salary</h1>
        </div>
        <div className="rounded-xl border border-amber-500/30 bg-amber-50 p-5 text-sm text-amber-800 leading-relaxed">
          {payrollParam
            ? "That claim link contains an invalid payroll id."
            : "This page needs a claim link from your employer."}{" "}
          Ask your employer for the link they generated when they set up payroll —
          it looks like <span className="font-mono">/claim?payroll=0x…</span>.
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 max-w-lg mx-auto w-full px-6 py-12 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">Claim your salary</h1>
        <p className="text-sm text-neutral-600 mt-1.5 leading-relaxed">
          Connect with a passkey. Your browser generates a ZK proof that
          you&rsquo;re on the payroll, then submits it on-chain to receive your
          pathUSD salary.
        </p>
        <p className="text-xs text-neutral-500 mt-2 font-mono break-all">
          Payroll: {payroll}
        </p>
      </div>

      {!isConnected && (
        <ConnectPanel note="First time here? Create a passkey account. Returning? Sign in with your passkey." />
      )}

      {isConnected && (
        <div className="space-y-5">
          {/* On-chain status */}
          <div className="rounded-xl border border-neutral-200 bg-white p-5 space-y-3 text-sm shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500 mb-1">On-chain status</p>
            <div className="flex justify-between items-center">
              <span className="text-neutral-500">Payroll active</span>
              <span className={`font-medium ${payrollActive ? "text-emerald-600" : "text-neutral-500"}`}>
                {payrollActive === undefined ? "—" : payrollActive ? "Yes" : "No"}
              </span>
            </div>
            <div className="border-t border-neutral-200" />
            <div className="flex justify-between items-center">
              <span className="text-neutral-500">Already claimed</span>
              <span className={`font-medium ${hasClaimed ? "text-amber-600" : "text-neutral-500"}`}>
                {hasClaimed === undefined ? "—" : hasClaimed ? "Yes" : "No"}
              </span>
            </div>
          </div>

          {/* Proving progress */}
          {state.phase === "proving" && (
            <div className="rounded-xl border border-neutral-200 bg-white p-5 space-y-3 shadow-sm">
              <p className="text-sm font-semibold text-neutral-900">Generating proof…</p>
              <p className="text-sm text-neutral-600">{proofStageLabel(state.proofStatus)}</p>
              <div className="h-1.5 rounded-full bg-neutral-200 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full transition-all duration-700"
                  style={{ width: `${proofStageProgress(state.proofStatus)}%` }}
                />
              </div>
            </div>
          )}

          {state.phase === "claiming" && (
            <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
              <p className="text-sm text-neutral-700">Submitting claim transaction…</p>
              <div className="mt-3 h-1.5 rounded-full bg-neutral-200 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full animate-pulse w-3/4" />
              </div>
            </div>
          )}

          {state.phase === "claimed" && (
            <div className="rounded-xl border border-emerald-600/30 bg-emerald-500/10 p-6 text-center space-y-2">
              <div className="w-12 h-12 rounded-full bg-emerald-500/15 border border-emerald-600/40 flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
              </div>
              <p className="text-3xl font-bold text-emerald-600">
                {formatUnits(state.amount, 6)}
              </p>
              <p className="text-sm font-medium text-emerald-700">pathUSD claimed</p>
            </div>
          )}

          {state.phase === "error" && (
            <div className="rounded-xl border border-red-500/30 bg-red-50 p-5 space-y-3">
              <p className="text-sm text-red-700 leading-relaxed">{state.message}</p>
              <button
                onClick={() => setState({ phase: "idle" })}
                className="text-xs text-neutral-500 hover:text-neutral-700 transition-colors"
              >
                ← Try again
              </button>
            </div>
          )}

          {/* Claim button */}
          {(state.phase === "idle" || state.phase === "fetching_path") && (
            <button
              onClick={handleClaim}
              disabled={!payrollActive || !!hasClaimed || state.phase === "fetching_path"}
              className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-neutral-200 disabled:text-neutral-400 disabled:cursor-not-allowed px-6 py-3.5 text-sm font-semibold text-white shadow-sm disabled:shadow-none transition-all active:scale-[0.99] disabled:active:scale-100"
            >
              {hasClaimed
                ? "Already claimed"
                : !payrollActive
                ? "No active payroll"
                : state.phase === "fetching_path"
                ? "Fetching Merkle path…"
                : "Generate proof & claim salary"}
            </button>
          )}
        </div>
      )}
    </main>
  );
}

export default function ClaimPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <ClaimHeader />
      <Suspense
        fallback={
          <main className="flex-1 max-w-lg mx-auto w-full px-6 py-12">
            <p className="text-sm text-neutral-500">Loading…</p>
          </main>
        }
      >
        <ClaimContent />
      </Suspense>
    </div>
  );
}
