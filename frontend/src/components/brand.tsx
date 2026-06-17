import type { CSSProperties } from "react";

/**
 * Legato brand primitives.
 *
 * The motif is the legato *slur* — the curved line drawn over connected notes
 * in sheet music. It appears as the wordmark accent, the logomark (a slur over
 * a note), and later as the connective line threading the ZK-flow diagram
 * (employer → shielded pool → proof → payment).
 *
 * Display text uses the `font-display` utility (Fraunces, wired in layout.tsx
 * via the --font-display token). Color flows through `currentColor` so callers
 * style with text-* utilities.
 */

const SLUR_PATH = "M5 22C70 3 170 3 235 22 170 11 70 11 5 22Z";

/** The slur: a filled, tapered crescent arc. Sizes to its container; color = currentColor. */
export function Slur({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg
      viewBox="0 0 240 26"
      fill="currentColor"
      aria-hidden
      className={className}
      style={style}
    >
      <path d={SLUR_PATH} />
    </svg>
  );
}

/** Stacked wordmark — slur arcing over "Legato". The primary brand lockup (hero, footer). */
export function Wordmark({
  size = "text-5xl",
  accent = "text-emerald-500",
  word = "text-neutral-900",
  className = "",
}: {
  size?: string;
  accent?: string;
  word?: string;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex flex-col items-center font-display font-semibold tracking-tight leading-none ${size} ${className}`}
    >
      <Slur className={accent} style={{ width: "1.85em", height: "auto", marginBottom: "0.08em" }} />
      <span className={word}>Legato</span>
    </span>
  );
}

/** Logomark — a slur over a note, on the emerald→teal flow gradient. Favicon / avatar / header. */
export function Mark({
  size = 40,
  className = "",
  gradientId = "legatoGrad",
}: {
  size?: number;
  className?: string;
  gradientId?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden
      className={className}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop stopColor="#10B981" />
          <stop offset="1" stopColor="#0D9488" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="15" fill={`url(#${gradientId})`} />
      <path d="M14 32C26 18 38 18 50 32 38 25 26 25 14 32Z" fill="white" />
      <circle cx="32" cy="43" r="5" fill="white" />
    </svg>
  );
}

/** Horizontal lockup — mark + "Legato". For page headers / nav. */
export function Lockup({
  size = "text-2xl",
  word = "text-neutral-900",
  className = "",
}: {
  size?: string;
  word?: string;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <Mark size={26} />
      <span className={`font-display font-semibold tracking-tight ${word} ${size}`}>Legato</span>
    </span>
  );
}
