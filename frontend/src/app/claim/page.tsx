"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  useAccount,
  useConfig,
  usePublicClient,
  useReadContract,
  useWriteContract,
} from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { formatUnits, parseUnits } from "viem";
import { proveWithdraw, type ProofStatus } from "@/lib/noir";
import { getShieldedKey, registryArgs, type ShieldedKey } from "@/lib/keys";
import { scanForNotes, selectNotes, type OwnedNote } from "@/lib/pool";
import { encryptNote } from "@/lib/notes";
import { WalletBadge } from "@/components/wallet";
import { Lockup, Slur } from "@/components/brand";
import { SHIELDED_POOL_ADDRESS, SHIELDED_POOL_ABI, PATH_USD_DECIMALS } from "@/lib/contracts";

const ZERO_ADDR = "0x0000000000000000000000000000000000000000" as const;
const DP = PATH_USD_DECIMALS;
const sum = (notes: OwnedNote[]) => notes.reduce((s, n) => s + n.value, 0n);

type Phase =
  | { kind: "idle" }
  | { kind: "registering" }
  | { kind: "scanning" }
  | { kind: "ready"; notes: OwnedNote[]; total: bigint }
  | { kind: "no_note" }
  | { kind: "withdrawing"; total: bigint; step: number; steps: number; status: ProofStatus | null }
  | { kind: "withdrawn"; amount: bigint }
  | { kind: "error"; message: string };

const PROOF_SLUR = "M14 46C92 8 232 8 310 46";

function ProofFlow({ progress, label }: { progress: number; label: string }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-neutral-900">Generating zero-knowledge proof…</p>
        <span className="text-sm font-mono text-emerald-700">{progress}%</span>
      </div>
      <svg viewBox="0 0 324 56" fill="none" className="w-full h-auto">
        <defs>
          <linearGradient id="proofFill" x1="0" y1="0" x2="324" y2="0" gradientUnits="userSpaceOnUse">
            <stop stopColor="#10b981" />
            <stop offset="1" stopColor="#14b8a6" />
          </linearGradient>
        </defs>
        <path d={PROOF_SLUR} stroke="#e5e5e5" strokeWidth={3} strokeLinecap="round" />
        <path
          d={PROOF_SLUR}
          stroke="url(#proofFill)"
          strokeWidth={3}
          strokeLinecap="round"
          pathLength={1}
          style={{ strokeDasharray: 1, strokeDashoffset: 1 - progress / 100, transition: "stroke-dashoffset 0.7s ease" }}
        />
      </svg>
      <p className="text-sm text-neutral-600">{label}</p>
    </div>
  );
}

function proofProgress(s: ProofStatus): number {
  switch (s.stage) {
    case "loading": return 15;
    case "executing_witness": return 45;
    case "generating_proof": return 75;
    case "done": return 100;
    default: return 0;
  }
}
function proofLabel(s: ProofStatus): string {
  switch (s.stage) {
    case "loading": return "Loading circuit WASM…";
    case "executing_witness": return "Executing witness — proving note ownership…";
    case "generating_proof": return "Generating ZK proof — this takes ~20–30 s…";
    case "done": return "Proof ready!";
    case "error": return "Error: " + s.message;
  }
}

export default function ClaimPage() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const config = useConfig();
  const { writeContractAsync } = useWriteContract();

  const [key, setKey] = useState<ShieldedKey | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [amountInput, setAmountInput] = useState("");

  const { data: keyData, refetch: refetchKey } = useReadContract({
    address: SHIELDED_POOL_ADDRESS,
    abi: SHIELDED_POOL_ABI,
    functionName: "keys",
    args: [address ?? ZERO_ADDR],
    query: { enabled: isConnected && !!address },
  });
  const registered = keyData?.[3] as boolean | undefined;

  // A wallet change (connect / disconnect / switch account) must discard every
  // bit of state tied to the previous account. Otherwise the old wallet's
  // scanned notes linger on screen and the auto-scan effect below never
  // re-fires — it only runs from the "idle" phase, and a stale "ready" phase
  // keeps it from ever scanning the new account until a manual page refresh.
  // Resetting during render (React's "adjust state when a value changes"
  // pattern) wipes the stale state before the auto-scan effect runs.
  const [account, setAccount] = useState(address);
  if (account !== address) {
    setAccount(address);
    setKey(null);
    setPhase({ kind: "idle" });
    setAmountInput("");
  }

  // Load (or, for passkeys, create) the connected account's shielded key.
  useEffect(() => {
    if (!isConnected || !address) return;
    // Guard against a slow key derivation from a previous account resolving
    // after we've already switched — it must not clobber the new account's key.
    let cancelled = false;
    getShieldedKey(address).then((k) => {
      if (!cancelled) setKey(k);
    });
    return () => {
      cancelled = true;
    };
  }, [isConnected, address]);

  const doScan = useCallback(async () => {
    if (!publicClient || !key) return;
    setPhase({ kind: "scanning" });
    try {
      const notes = await scanForNotes(publicClient, key);
      if (notes.length === 0) return setPhase({ kind: "no_note" });
      const total = sum(notes);
      setAmountInput(formatUnits(total, DP));
      setPhase({ kind: "ready", notes, total });
    } catch (e) {
      setPhase({ kind: "error", message: "Scan failed: " + msg(e) });
    }
  }, [publicClient, key]);

  useEffect(() => {
    if (key && registered === true && phase.kind === "idle") doScan();
  }, [key, registered, phase.kind, doScan]);

  async function handleRegister() {
    if (!key) return;
    setPhase({ kind: "registering" });
    try {
      const [pk, ex, ey] = registryArgs(key);
      const hash = await writeContractAsync({
        address: SHIELDED_POOL_ADDRESS,
        abi: SHIELDED_POOL_ABI,
        functionName: "registerKey",
        args: [pk, ex, ey],
      });
      await waitForTransactionReceipt(config, { hash });
      await refetchKey();
      setPhase({ kind: "idle" });
    } catch (e) {
      setPhase({ kind: "error", message: "Registration failed: " + msg(e) });
    }
  }

  // Withdraw `amountInput` across as many notes as needed (the circuit spends one note per proof).
  async function handleWithdraw(notes: OwnedNote[], total: bigint) {
    if (!key || !address) return;
    let amount: bigint;
    try {
      amount = parseUnits(amountInput || "0", DP);
    } catch {
      return setPhase({ kind: "error", message: "Invalid amount" });
    }
    if (amount <= 0n || amount > total) {
      return setPhase({ kind: "error", message: `Enter an amount between 0 and ${formatUnits(total, DP)}` });
    }

    const picked = selectNotes(notes, amount);
    const steps = picked.length;
    let remaining = amount;
    let withdrawn = 0n;

    try {
      for (let i = 0; i < picked.length; i++) {
        const note = picked[i];
        const payout = remaining < note.value ? remaining : note.value; // last note may be partial
        const step = i + 1;

        setPhase({ kind: "withdrawing", total, step, steps, status: { stage: "loading" } });
        const wp = await proveWithdraw(key, note, note.proof, payout, address, (status) =>
          setPhase({ kind: "withdrawing", total, step, steps, status }),
        );
        const enc = await encryptNote(key.encPub, wp.changeValue, wp.changeBlinding);

        if (process.env.NEXT_PUBLIC_DEV_PRIVATE_KEY) {
          (window as unknown as Record<string, unknown>).__claimDebug = { proof: wp.proof, pub: wp.publicInputs };
        }

        setPhase({ kind: "withdrawing", total, step, steps, status: null }); // submitting
        const hash = await writeContractAsync({
          address: SHIELDED_POOL_ADDRESS,
          abi: SHIELDED_POOL_ABI,
          functionName: "withdraw",
          args: [wp.proof, wp.publicInputs, enc.ephPubkey, enc.ciphertext, enc.tag],
        });
        await waitForTransactionReceipt(config, { hash });

        remaining -= payout;
        withdrawn += payout;
      }
      setPhase({ kind: "withdrawn", amount: withdrawn });
    } catch (e) {
      if (process.env.NEXT_PUBLIC_DEV_PRIVATE_KEY) {
        (window as unknown as Record<string, unknown>).__claimError = { message: msg(e) };
      }
      setPhase({ kind: "error", message: "Withdraw failed: " + msg(e) });
    }
  }

  const balanceTotal =
    phase.kind === "ready" || phase.kind === "withdrawing" ? phase.total : null;

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/80 backdrop-blur-sm px-6 py-3.5 flex items-center justify-between">
        <Link href="/" aria-label="Legato home" className="transition-opacity hover:opacity-80">
          <Lockup size="text-base" />
        </Link>
        <WalletBadge />
      </header>

      <main className="flex-1 max-w-lg mx-auto w-full px-6 py-12 space-y-8">
        <div>
          <h1 className="text-3xl font-display font-semibold tracking-tight text-neutral-900">Claim your salary</h1>
          <p className="text-sm text-neutral-600 mt-1.5 leading-relaxed">
            Your browser scans the pool, decrypts your assets, and proves ownership to withdraw locally.
          </p>
        </div>

        {!isConnected && (
          <div className="flex items-center gap-3 rounded-xl border border-dashed border-neutral-300 bg-white/60 p-5 text-sm text-neutral-600 shadow-sm">
            <svg className="h-5 w-5 flex-shrink-0 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 16.5 16.5 7.5m0 0H9m7.5 0V15" />
            </svg>
            <span>
              Connect a passkey wallet to claim — use{" "}
              <span className="font-medium text-neutral-900">Connect wallet</span> in the top-right.
            </span>
          </div>
        )}

        {isConnected && (
          <div className="space-y-5">
            {registered === false && phase.kind !== "registering" && (
              <div className="rounded-xl border border-neutral-200 bg-white p-5 space-y-3 shadow-sm">
                <p className="text-sm font-semibold text-neutral-900">Register your shielded key</p>
                <p className="text-sm text-neutral-600 leading-relaxed">
                  Publish your shielded key once for employers to pay you privately.
                </p>
                <button
                  onClick={handleRegister}
                  className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-700 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all active:scale-[0.99]"
                >
                  Register shielded key
                </button>
              </div>
            )}

            {phase.kind === "registering" && <Info text="Registering your shielded key on-chain…" />}
            {phase.kind === "scanning" && <Info text="Scanning the pool for your notes…" />}

            {phase.kind === "no_note" && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-50 p-5 text-sm text-amber-800 leading-relaxed space-y-3">
                <p>No spendable notes found yet. Ask your employer to deposit your salary into the pool (they need your address).</p>
                <button onClick={doScan} className="text-xs font-medium text-emerald-700 hover:text-emerald-800">↻ Scan again</button>
              </div>
            )}

            {balanceTotal !== null && (
              <ShieldedBalance
                value={balanceTotal}
                noteCount={phase.kind === "ready" ? phase.notes.length : undefined}
              />
            )}

            {phase.kind === "ready" && (
              <div className="rounded-xl border border-neutral-200 bg-white p-5 space-y-4 shadow-sm">
                <label className="text-sm font-medium text-neutral-700 block">Withdraw amount (pathUSD)</label>
                <div className="flex items-center gap-2.5">
                  <input
                    type="number"
                    min="0"
                    value={amountInput}
                    onChange={(e) => setAmountInput(e.target.value)}
                    className="w-48 rounded-lg border border-neutral-300 bg-white px-3.5 py-2.5 text-sm text-neutral-900 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none transition-all"
                  />
                  <button
                    onClick={() => setAmountInput(formatUnits(phase.total, DP))}
                    className="text-xs font-medium text-emerald-700 hover:text-emerald-800"
                  >
                    Max
                  </button>
                </div>
                <button
                  onClick={() => handleWithdraw(phase.notes, phase.total)}
                  className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-700 px-6 py-3.5 text-sm font-semibold text-white shadow-sm transition-all active:scale-[0.99]"
                >
                  Generate proof & withdraw
                </button>
                <p className="text-xs text-neutral-500 leading-relaxed">
                  {phase.notes.length > 1
                    ? `Your balance spans ${phase.notes.length} notes; withdrawing across more than one signs one proof per note.`
                    : "Withdrawing less than the full balance keeps the remainder as a fresh shielded note."}
                </p>
              </div>
            )}

            {phase.kind === "withdrawing" && (
              phase.status && phase.status.stage !== "done" ? (
                <ProofFlow
                  progress={proofProgress(phase.status)}
                  label={
                    (phase.steps > 1 ? `Note ${phase.step} of ${phase.steps} — ` : "") +
                    proofLabel(phase.status)
                  }
                />
              ) : (
                <Info
                  text={
                    phase.steps > 1
                      ? `Submitting withdrawal ${phase.step} of ${phase.steps} to Tempo…`
                      : "Submitting your withdrawal to Tempo…"
                  }
                />
              )
            )}

            {phase.kind === "withdrawn" && (
              <div className="rounded-2xl border border-emerald-600/30 bg-emerald-500/10 p-8 text-center">
                <Slur className="text-emerald-500 mx-auto" style={{ width: 132 }} />
                <p className="mt-5 font-display text-5xl font-semibold tracking-tight text-emerald-600">
                  {formatUnits(phase.amount, DP)}
                </p>
                <p className="mt-1.5 text-sm font-medium text-emerald-700">pathUSD withdrawn</p>
                <button
                  onClick={() => setPhase({ kind: "idle" })}
                  className="mt-5 text-xs text-neutral-500 hover:text-neutral-700"
                >
                  ↻ Withdraw more from your remaining balance
                </button>
              </div>
            )}

            {phase.kind === "error" && (
              <div className="rounded-xl border border-red-500/30 bg-red-50 p-5 space-y-3">
                <p className="text-sm text-red-700 leading-relaxed">{phase.message}</p>
                <button onClick={() => setPhase({ kind: "idle" })} className="text-xs text-neutral-500 hover:text-neutral-700">
                  ← Try again
                </button>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function ShieldedBalance({ value, noteCount }: { value: bigint; noteCount?: number }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">Shielded balance</p>
      <p className="mt-1 font-display text-3xl font-semibold tracking-tight text-neutral-900">
        {formatUnits(value, DP)} <span className="text-base font-normal text-neutral-500">pathUSD</span>
      </p>
      {noteCount !== undefined && noteCount > 1 && (
        <p className="mt-1 text-xs text-neutral-500">across {noteCount} notes</p>
      )}
    </div>
  );
}

function Info({ text }: { text: string }) {
  return <div className="rounded-lg border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-700">{text}</div>;
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
