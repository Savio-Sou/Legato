"use client";

import { useEffect, useRef, useState } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";

function truncate(s: string, len = 10) {
  if (s.length <= len) return s;
  return s.slice(0, 6) + "…" + s.slice(-4);
}

// The app name used as the passkey label / Relying Party "user" name.
const PASSKEY_NAME = "Legato";

const ChevronDown = ({ className = "" }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
  </svg>
);
const CopyIcon = () => (
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 7.5h-.75A2.25 2.25 0 0 0 4.5 9.75v7.5a2.25 2.25 0 0 0 2.25 2.25h7.5a2.25 2.25 0 0 0 2.25-2.25v-.75m-6-6h7.5a2.25 2.25 0 0 1 2.25 2.25v7.5a2.25 2.25 0 0 1-2.25 2.25h-7.5a2.25 2.25 0 0 1-2.25-2.25v-7.5a2.25 2.25 0 0 1 2.25-2.25z" />
  </svg>
);
const CheckIcon = () => (
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
  </svg>
);
const LogoutIcon = () => (
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
  </svg>
);
const WalletIcon = () => (
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden>
    <rect x="3" y="6" width="18" height="13" rx="2.5" />
    <path strokeLinecap="round" d="M3 10.5h18" />
    <circle cx="16.5" cy="14.75" r="1" fill="currentColor" stroke="none" />
  </svg>
);
const UserPlusIcon = () => (
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7.5v6m3-3h-6m-3-1.875a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0ZM4.5 20.25a7.5 7.5 0 0 1 13.5-4.5" />
  </svg>
);
const KeyIcon = () => (
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1 1 21.75 8.25Z" />
  </svg>
);

// Shared: close on outside-click / Escape. The callback is kept in a ref so the
// listener effect only re-subscribes when `open` flips.
function useDismiss(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const cb = useRef(onClose);
  cb.current = onClose;
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) cb.current();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") cb.current();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);
  return ref;
}

/**
 * Header wallet control. Disconnected → a "Connect wallet" pill with a passkey
 * menu; connected → the account pill with copy / disconnect. Both states share
 * the same pill + animated-popover styling.
 */
export function WalletBadge() {
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));

  if (!isConnected || !address) return <ConnectButton />;

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be unavailable (e.g. insecure context); fail quietly.
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`group inline-flex items-center gap-2 rounded-full border bg-white px-3 py-1.5 text-sm font-mono shadow-sm transition-all active:scale-95 ${
          open
            ? "border-emerald-400/70 text-emerald-800 ring-2 ring-emerald-500/15"
            : "border-neutral-200 text-neutral-700 hover:border-emerald-400/60 hover:bg-emerald-50/40"
        }`}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Account options"
      >
        <span className="relative flex h-2 w-2" aria-hidden>
          <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400/70 motion-safe:animate-ping" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        {truncate(address)}
        <ChevronDown
          className={`h-3.5 w-3.5 text-neutral-400 transition-transform duration-200 group-hover:text-emerald-600 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="animate-pop absolute right-0 z-20 mt-2 w-56 overflow-hidden rounded-xl border border-neutral-200 bg-white/95 p-1 shadow-xl shadow-black/5 backdrop-blur-sm"
        >
          <div className="px-3 pb-2.5 pt-2">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
              Connected
            </p>
            <p className="mt-0.5 break-all font-mono text-xs leading-snug text-neutral-600">{address}</p>
          </div>
          <div className="mx-2 h-px bg-neutral-100" />
          <button
            role="menuitem"
            onClick={copyAddress}
            className="group/item mt-1 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-neutral-700 transition-all hover:bg-emerald-50 hover:text-emerald-700 active:scale-[0.98]"
          >
            <span className={copied ? "text-emerald-600" : "text-neutral-400 group-hover/item:text-emerald-600"}>
              {copied ? <CheckIcon /> : <CopyIcon />}
            </span>
            {copied ? "Copied!" : "Copy address"}
          </button>
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              disconnect();
            }}
            className="group/item flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-neutral-700 transition-all hover:bg-red-50 hover:text-red-600 active:scale-[0.98]"
          >
            <span className="text-neutral-400 group-hover/item:text-red-500">
              <LogoutIcon />
            </span>
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Disconnected-state header control: a "Connect wallet" pill whose menu offers
 * the two top-level passkey actions (mirrors ConnectPanel, in compact form).
 */
function ConnectButton() {
  const { connect, connectors, isPending, error } = useConnect();
  const connector = connectors[0];
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));

  // wagmi's connect variables type doesn't model the Tempo connector's
  // `capabilities`, so cast just these calls.
  const createAccount = () =>
    connect({ connector, capabilities: { method: "register", name: PASSKEY_NAME } } as Parameters<typeof connect>[0]);
  // `selectAccount: true` authenticates with an EMPTY allowCredentials list, so
  // the browser shows the discoverable-passkey picker with ALL site passkeys.
  const signIn = () =>
    connect({ connector, capabilities: { selectAccount: true } } as Parameters<typeof connect>[0]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={isPending}
        className="group inline-flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-1.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-emerald-700 active:scale-95 disabled:opacity-70"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <WalletIcon />
        {isPending ? "Waiting for passkey…" : "Connect wallet"}
        {!isPending && (
          <ChevronDown
            className={`h-3.5 w-3.5 text-white/70 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          />
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="animate-pop absolute right-0 z-20 mt-2 w-64 overflow-hidden rounded-xl border border-neutral-200 bg-white/95 p-1 shadow-xl shadow-black/5 backdrop-blur-sm"
        >
          <button
            role="menuitem"
            onClick={createAccount}
            disabled={isPending}
            className="group/item flex w-full items-start gap-2.5 rounded-lg px-3 py-2.5 text-left transition-all hover:bg-emerald-50 active:scale-[0.98] disabled:opacity-60"
          >
            <span className="mt-0.5 text-neutral-400 group-hover/item:text-emerald-600">
              <UserPlusIcon />
            </span>
            <span>
              <span className="block text-sm font-medium text-neutral-900 group-hover/item:text-emerald-700">
                Create passkey account
              </span>
              <span className="block text-xs text-neutral-500">First time here — register a new passkey.</span>
            </span>
          </button>
          <button
            role="menuitem"
            onClick={signIn}
            disabled={isPending}
            className="group/item flex w-full items-start gap-2.5 rounded-lg px-3 py-2.5 text-left transition-all hover:bg-emerald-50 active:scale-[0.98] disabled:opacity-60"
          >
            <span className="mt-0.5 text-neutral-400 group-hover/item:text-emerald-600">
              <KeyIcon />
            </span>
            <span>
              <span className="block text-sm font-medium text-neutral-900 group-hover/item:text-emerald-700">
                Sign in with passkey
              </span>
              <span className="block text-xs text-neutral-500">Returning — use your existing passkey.</span>
            </span>
          </button>
          {error && (
            <p className="px-3 py-1.5 text-xs leading-relaxed text-red-600">{error.message.split("\n")[0]}</p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Passkey connect panel. Two real, top-level WebAuthn actions:
 *  - "Create passkey account" → registers a new domain-bound passkey
 *    (connect with capabilities.method === "register").
 *  - "Sign in with passkey"   → authenticates an existing passkey.
 * Works in every browser because the ceremony is NOT inside a cross-origin iframe.
 */
export function ConnectPanel({ note }: { note?: string }) {
  const { connect, connectors, isPending, error } = useConnect();
  const connector = connectors[0];

  // wagmi's connect variables type doesn't model the Tempo connector's
  // `capabilities`, so cast just these calls.
  const createAccount = () =>
    connect({ connector, capabilities: { method: "register", name: PASSKEY_NAME } } as Parameters<typeof connect>[0]);
  // `selectAccount: true` makes the connector authenticate with an EMPTY
  // allowCredentials list, so the browser shows the discoverable-passkey picker
  // with ALL passkeys for this site — not just the most recently created one.
  const signIn = () =>
    connect({ connector, capabilities: { selectAccount: true } } as Parameters<typeof connect>[0]);

  return (
    <div className="space-y-3">
      <button
        onClick={createAccount}
        disabled={isPending}
        className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 px-6 py-3.5 text-sm font-semibold text-white shadow-sm transition-all active:scale-[0.99]"
      >
        {isPending ? "Waiting for passkey…" : "Create passkey account"}
      </button>
      <button
        onClick={signIn}
        disabled={isPending}
        className="w-full rounded-lg border border-neutral-300 bg-white hover:border-emerald-500/60 hover:text-emerald-700 disabled:opacity-60 px-6 py-3 text-sm font-medium text-neutral-700 transition-all"
      >
        Sign in with passkey
      </button>
      {note && <p className="text-xs text-neutral-500 leading-relaxed">{note}</p>}
      {error && (
        <p className="text-xs text-red-600 leading-relaxed">
          {error.message.split("\n")[0]}
        </p>
      )}
    </div>
  );
}
