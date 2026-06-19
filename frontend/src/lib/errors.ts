/**
 * Turns the wall of text viem throws on a failed contract call into a short,
 * human-readable message with a clear next step.
 *
 * viem wraps the underlying cause in a chain of `BaseError`s (e.g.
 * ContractFunctionExecutionError → TransactionExecutionError → InsufficientFundsError).
 * Rather than regex the rendered `.message`, we walk that cause chain with
 * `BaseError.walk()` and match on the typed error classes — robust across viem's
 * message wording changes.
 */
import {
  BaseError,
  InsufficientFundsError,
  UserRejectedRequestError,
  ContractFunctionRevertedError,
} from "viem";

// Where users top up testnet gas (native USD on Moderato).
const FAUCET_URL = "https://docs.tempo.xyz/quickstart/faucet";

export interface FriendlyError {
  /** One-line headline, safe to show in bold. */
  title: string;
  /** Plain-language explanation and what to do next. */
  detail?: string;
  /** Optional call-to-action link (e.g. the faucet). */
  action?: { label: string; href: string };
  /** The original error text, kept for a "show details" disclosure. */
  raw: string;
}

// Friendly copy for the pool's custom revert errors (see SHIELDED_POOL_ABI).
const CONTRACT_ERRORS: Record<string, Omit<FriendlyError, "raw">> = {
  AlreadyRegistered: {
    title: "Key already registered",
    detail: "This wallet already has a shielded key — you're all set.",
  },
  InvalidProof: {
    title: "Proof rejected",
    detail: "The zero-knowledge proof didn't verify on-chain. Refresh and try again.",
  },
  NullifierAlreadySpent: {
    title: "Note already spent",
    detail: "This note was already withdrawn. Rescan the pool for your remaining balance.",
  },
  UnknownRoot: {
    title: "Pool state out of sync",
    detail: "Your view of the pool is stale. Refresh the page and try again.",
  },
  TransferFailed: {
    title: "Token transfer failed",
    detail: "The pathUSD transfer was rejected. Check your balance and allowance, then retry.",
  },
  InvalidInputsLength: {
    title: "Malformed transaction",
    detail: "The call was built incorrectly. Refresh and try again.",
  },
};

function rawText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Every message in an error's viem cause chain, joined.
 *
 * Some wallet connectors — notably Tempo's passkey/AA signer — surface RPC
 * failures as opaque nested cause strings (e.g. "Transaction creation failed."
 * → "…insufficient funds for gas…") without ever constructing viem's typed
 * error classes. So `walk(e => e instanceof InsufficientFundsError)` misses
 * them. We scan the flattened chain text as a fallback for those cases.
 */
function chainText(e: unknown): string {
  if (e instanceof BaseError) {
    const parts: string[] = [];
    e.walk((err) => {
      if (err instanceof Error && err.message) parts.push(err.message);
      return false; // visit every node; never "match"
    });
    return parts.join("\n");
  }
  return rawText(e);
}

// viem's own definition of what a node "insufficient funds" error reads like —
// reused so our string fallback stays in lockstep with viem's classification.
const INSUFFICIENT_FUNDS_RE = InsufficientFundsError.nodeMessage;
const USER_REJECTED_RE = /user rejected|user denied|rejected the request|request rejected|denied (the )?(transaction|signature)/i;

/**
 * True when an error is the chain's "can't pay for gas" failure — whether viem
 * typed it (EOA wallets) or it only appears as text in the cause chain (Tempo
 * passkey/AA connector). Used to decide whether to auto-fund and retry.
 */
export function isInsufficientFunds(e: unknown): boolean {
  if (e instanceof BaseError && e.walk((err) => err instanceof InsufficientFundsError)) return true;
  return INSUFFICIENT_FUNDS_RE.test(chainText(e));
}

/** A friendly error for our own validation messages (no underlying viem error to show). */
export function plainError(title: string, detail?: string): FriendlyError {
  return { title, detail, raw: "" };
}

/**
 * Map any error thrown by a wagmi/viem contract call to friendly copy.
 * `fallbackTitle` is used when we can't identify the cause (e.g. "Registration failed").
 */
export function friendlyError(e: unknown, fallbackTitle = "Something went wrong"): FriendlyError {
  const raw = rawText(e);
  // Both the typed cause chain (precise) and its flattened text (catches
  // connectors that don't construct viem's typed errors, e.g. Tempo passkeys).
  const isBase = e instanceof BaseError;
  const hay = chainText(e);

  // No funds to pay for gas — the most common demo stumble.
  if (isInsufficientFunds(e)) {
    return {
      title: "Not enough funds for gas",
      detail: "This wallet has no testnet pathUSD to pay the network fee. Top up your wallet and try again.",
      action: { label: "Get testnet funds →", href: FAUCET_URL },
      raw,
    };
  }

  // User dismissed the wallet/passkey prompt.
  if ((isBase && e.walk((err) => err instanceof UserRejectedRequestError)) || USER_REJECTED_RE.test(hay)) {
    return {
      title: "Request cancelled",
      detail: "You dismissed the wallet prompt. Try again when you're ready.",
      raw,
    };
  }

  // A contract revert — surface the specific custom error if we know it.
  const reverted = isBase ? e.walk((err) => err instanceof ContractFunctionRevertedError) : null;
  if (reverted instanceof ContractFunctionRevertedError) {
    const name = reverted.data?.errorName ?? reverted.reason;
    const mapped = name ? CONTRACT_ERRORS[name] : undefined;
    if (mapped) return { ...mapped, raw };
    return {
      title: "Transaction reverted",
      detail: name ? `The contract rejected the call (${name}).` : "The contract rejected the call.",
      raw,
    };
  }
  // Custom revert not typed by the connector — match the error name in the chain text.
  for (const name of Object.keys(CONTRACT_ERRORS)) {
    if (hay.includes(name)) return { ...CONTRACT_ERRORS[name], raw };
  }

  return { title: fallbackTitle, detail: "The transaction couldn't be completed.", raw };
}
