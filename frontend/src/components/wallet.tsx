"use client";

import { useEffect, useRef, useState } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";

function truncate(s: string, len = 10) {
  if (s.length <= len) return s;
  return s.slice(0, 6) + "…" + s.slice(-4);
}

// The app name used as the passkey label / Relying Party "user" name.
const PASSKEY_NAME = "Legato";

/**
 * Connected wallet badge for page headers: shows the address as a button that
 * opens a small menu to copy the address or disconnect.
 * Renders nothing when not connected.
 */
export function WalletBadge() {
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close the menu on an outside click or Escape press.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!isConnected || !address) return null;

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
        className="text-sm text-emerald-700 hover:text-emerald-900 font-mono transition-colors"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Account options"
      >
        {truncate(address)}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-2 w-44 overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-lg shadow-black/5 backdrop-blur-sm"
        >
          <button
            role="menuitem"
            onClick={copyAddress}
            className="w-full px-4 py-2.5 text-left text-sm text-neutral-700 hover:bg-neutral-100 hover:text-emerald-700 transition-colors"
          >
            {copied ? "Copied!" : "Copy address"}
          </button>
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              disconnect();
            }}
            className="w-full border-t border-neutral-200 px-4 py-2.5 text-left text-sm text-neutral-700 transition-colors hover:bg-neutral-100 hover:text-red-600"
          >
            Disconnect
          </button>
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
