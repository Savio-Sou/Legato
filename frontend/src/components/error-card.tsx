import type { FriendlyError } from "@/lib/errors";

/**
 * Renders a {@link FriendlyError}: a bold headline, plain-language detail, an
 * optional CTA (e.g. faucet link), and the raw error tucked behind a disclosure
 * for debugging. Replaces the old "dump viem's message in red text" treatment.
 */
export function ErrorCard({ error, onRetry }: { error: FriendlyError; onRetry: () => void }) {
  return (
    <div className="rounded-xl border border-red-500/30 bg-red-50 p-5 space-y-3">
      <p className="text-sm font-semibold text-red-800">{error.title}</p>
      {error.detail && <p className="text-sm text-red-700 leading-relaxed">{error.detail}</p>}

      {error.action && (
        <a
          href={error.action.href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block text-sm font-medium text-emerald-700 hover:text-emerald-800"
        >
          {error.action.label}
        </a>
      )}

      {error.raw && (
        <details className="group">
          <summary className="cursor-pointer list-none text-xs text-red-600/70 hover:text-red-700 select-none">
            <span className="group-open:hidden">Show technical details</span>
            <span className="hidden group-open:inline">Hide technical details</span>
          </summary>
          <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-md bg-red-100/60 p-2.5 font-mono text-[11px] leading-relaxed text-red-700/80">
            {error.raw}
          </pre>
        </details>
      )}

      <button onClick={onRetry} className="block text-xs text-neutral-500 hover:text-neutral-700">
        ← Try again
      </button>
    </div>
  );
}
