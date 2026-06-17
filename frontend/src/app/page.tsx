import Link from "next/link";
import { Slur, Wordmark, Lockup } from "@/components/brand";

/* ---------------------------------------------------------------- icons --- */
/* Outline · 1.5 stroke · round caps — per the brand icon direction. */
const IC = "w-6 h-6";

const ArrowRight = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
  </svg>
);
const IconLock = () => (
  <svg className={IC} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25z" />
  </svg>
);
const IconChip = () => (
  <svg className={IC} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 0 0 2.25-2.25V6.75a2.25 2.25 0 0 0-2.25-2.25H6.75A2.25 2.25 0 0 0 4.5 6.75v10.5a2.25 2.25 0 0 0 2.25 2.25zm.75-12h9v9h-9v-9z" />
  </svg>
);
const IconShield = () => (
  <svg className={IC} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
  </svg>
);
const IconUsers = () => (
  <svg className={IC} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
  </svg>
);
const IconTree = () => (
  <svg className={IC} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75 7 17.25M12 6.75l5 10.5" />
    <circle cx="12" cy="5" r="2" /><circle cx="6.5" cy="18.5" r="2" /><circle cx="17.5" cy="18.5" r="2" />
  </svg>
);
const IconCoin = () => (
  <svg className={IC} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <circle cx="12" cy="12" r="8.25" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 7.5v9m2.25-6.75A2.25 2.25 0 0 0 12 9a2.25 2.25 0 0 0 0 4.5 2.25 2.25 0 0 1 0 4.5 2.25 2.25 0 0 1-2.25-1.5" />
  </svg>
);

/* ------------------------------------------------------------ flow data --- */
// One flowing slur line through 4 points; the value-dot rides it. viewBox 1000×240.
const FLOW_PATH = "M90 120 C200 120 270 82 370 82 C470 82 560 158 640 158 C740 158 820 90 910 92";
const NODES = [
  { left: "9%", top: "50%", label: "Employer", caption: "deposits encrypted notes", icon: <IconUsers /> },
  { left: "37%", top: "34%", label: "Shielded pool", caption: "shared commitment tree", icon: <IconTree /> },
  { left: "64%", top: "66%", label: "ZK proof", caption: "generated in-browser", icon: <IconShield /> },
  { left: "91%", top: "38%", label: "Payment", caption: "pathUSD paid out", icon: <IconCoin /> },
];

const PILLARS = [
  { icon: <IconLock />, title: "Privacy by default", body: "Your salary stays yours. The on-chain proof reveals nothing about the amount." },
  { icon: <IconChip />, title: "In-browser proving", body: "Your browser runs the ZK prover locally with NoirJS + Barretenberg WASM — nothing secret leaves your device." },
  { icon: <IconShield />, title: "On-chain verification", body: "A Solidity verifier checks the proof before a single pathUSD moves." },
];

const STEPS = [
  "HR deposits each salary into the shared shielded pool as an encrypted note — the amounts are visible, but who they belong to never appears on-chain.",
  "An employee connects a passkey wallet — their browser scans the pool and decrypts the notes that belong to them.",
  "The browser generates a ZK proof of ownership plus a nullifier — proving the note is theirs without revealing which deposit funded it.",
  "The contract verifies the proof and pays pathUSD to the employee, re-shielding any remainder as a fresh note.",
];

/* -------------------------------------------------------------- sections -- */
function Header() {
  return (
    <header className="relative z-10 flex items-center justify-between px-6 py-5 max-w-6xl mx-auto w-full">
      <Lockup size="text-xl" />
    </header>
  );
}

function Hero() {
  return (
    <section className="relative isolate overflow-hidden flex flex-col min-h-[86vh]">
      {/* subtle emerald glow */}
      <div
        className="absolute inset-0 -z-10"
        style={{ backgroundImage: "radial-gradient(ellipse 75% 55% at 50% -5%, rgba(16,185,129,0.12), transparent 60%)" }}
      />
      {/* ambient floating slur */}
      <Slur
        aria-hidden
        className="absolute -z-10 left-1/2 top-[44%] text-emerald-500/15 legato-float"
        style={{ width: "min(92vw, 940px)" }}
      />

      <Header />

      <div className="flex-1 flex flex-col items-center justify-center text-center px-6 pb-20">
        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-600/30 bg-emerald-500/10 px-4 py-1.5 text-sm font-medium text-emerald-700 tracking-wide">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Powered by Noir + Tempo testnet
        </div>

        <h1 className="mt-6 font-display font-semibold tracking-tight leading-[1.02] text-5xl sm:text-6xl md:text-7xl max-w-4xl text-neutral-900">
          Private payroll that{" "}
          <span className="bg-gradient-to-r from-emerald-500 to-teal-500 bg-clip-text text-transparent">
            flows.
          </span>
        </h1>

        <p className="mt-6 text-lg text-neutral-600 max-w-xl leading-relaxed">
          Employees receive their salary without revealing the amount to anyone on-chain — verified
          by a zero-knowledge proof, paid in{" "}
          <span className="text-neutral-900 font-medium">pathUSD</span> on Tempo.
        </p>

        <div className="mt-9 flex flex-col sm:flex-row gap-3">
          <Link
            href="/admin"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-7 py-3.5 text-sm font-semibold text-white shadow-sm transition-all active:scale-[0.98]"
          >
            Set up payroll <ArrowRight />
          </Link>
          <Link
            href="/claim"
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-neutral-300 bg-white hover:border-neutral-400 hover:bg-neutral-50 px-7 py-3.5 text-sm font-semibold text-neutral-700 hover:text-neutral-900 transition-all active:scale-[0.98]"
          >
            Claim your salary <ArrowRight />
          </Link>
        </div>
      </div>

      {/* Scroll cue — hints there's more below the fold; clicking scrolls to it */}
      <a
        href="#how-it-flows"
        aria-label="Scroll to how value flows"
        className="absolute bottom-6 left-1/2 -translate-x-1/2 text-neutral-400 hover:text-emerald-600 transition-colors animate-bounce motion-reduce:animate-none"
      >
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </a>
    </section>
  );
}

function FlowDiagram() {
  return (
    <section id="how-it-flows" className="px-6 py-24 max-w-6xl mx-auto w-full reveal">
      <div className="text-center max-w-2xl mx-auto">
        <p className="text-xs font-semibold uppercase tracking-widest text-emerald-700">How value flows</p>
        <h2 className="mt-3 font-display text-3xl sm:text-4xl font-semibold tracking-tight text-neutral-900">
          From HR to employee — connected, private, verified.
        </h2>
      </div>

      {/* Horizontal animated diagram (md and up) */}
      <div className="relative mt-16 hidden md:block aspect-[1000/240]">
        <svg
          viewBox="0 0 1000 240"
          preserveAspectRatio="none"
          fill="none"
          className="absolute inset-0 h-full w-full"
        >
          <defs>
            <linearGradient id="flowLine" x1="0" y1="0" x2="1000" y2="0" gradientUnits="userSpaceOnUse">
              <stop stopColor="#10b981" />
              <stop offset="1" stopColor="#14b8a6" />
            </linearGradient>
          </defs>
          <path
            id="flowPath"
            d={FLOW_PATH}
            stroke="url(#flowLine)"
            strokeWidth={2.5}
            strokeLinecap="round"
            pathLength={1}
            className="legato-draw-path"
          />
          {/* halo + value dot riding the line */}
          <circle r={12} fill="#10b981" opacity={0.18} className="flow-dot">
            <animateMotion dur="4.8s" repeatCount="indefinite" rotate="auto">
              <mpath href="#flowPath" />
            </animateMotion>
          </circle>
          <circle r={5} fill="#10b981" className="flow-dot">
            <animateMotion dur="4.8s" repeatCount="indefinite" rotate="auto">
              <mpath href="#flowPath" />
            </animateMotion>
          </circle>
        </svg>

        {NODES.map((n) => (
          <div
            key={n.label}
            className="absolute flex flex-col items-center text-center"
            style={{ left: n.left, top: n.top, transform: "translate(-50%, -50%)" }}
          >
            <div className="w-14 h-14 rounded-2xl bg-white border border-neutral-200 shadow-sm flex items-center justify-center text-emerald-600">
              {n.icon}
            </div>
            <p className="mt-3 text-sm font-semibold text-neutral-900 whitespace-nowrap">{n.label}</p>
            <p className="text-xs text-neutral-500 whitespace-nowrap">{n.caption}</p>
          </div>
        ))}
      </div>

      {/* Vertical flow (mobile) */}
      <div className="md:hidden mt-12 relative pl-4">
        <div className="absolute left-[27px] top-2 bottom-2 w-0.5 bg-gradient-to-b from-emerald-500 to-teal-500" />
        <div className="space-y-6">
          {NODES.map((n) => (
            <div key={n.label} className="relative flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-white border border-neutral-200 shadow-sm flex items-center justify-center text-emerald-600 shrink-0 z-10">
                {n.icon}
              </div>
              <div>
                <p className="text-sm font-semibold text-neutral-900">{n.label}</p>
                <p className="text-xs text-neutral-500">{n.caption}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Pillars() {
  return (
    <section className="px-6 pb-24 max-w-5xl mx-auto w-full reveal">
      <div className="grid sm:grid-cols-3 gap-4">
        {PILLARS.map((p) => (
          <div
            key={p.title}
            className="rounded-2xl border border-neutral-200 bg-white p-6 space-y-3 shadow-sm hover:border-emerald-500/30 transition-colors"
          >
            <div className="w-11 h-11 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 flex items-center justify-center">
              {p.icon}
            </div>
            <h3 className="font-semibold text-neutral-900">{p.title}</h3>
            <p className="text-sm text-neutral-600 leading-relaxed">{p.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section className="px-6 pb-24 max-w-3xl mx-auto w-full reveal">
      <div className="rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500 mb-5">
          How it works
        </p>
        <ol className="space-y-4">
          {STEPS.map((step, i) => (
            <li key={i} className="flex gap-4 items-start">
              <span className="mt-0.5 flex-shrink-0 w-6 h-6 rounded-full bg-emerald-500/10 border border-emerald-600/30 text-emerald-700 text-xs flex items-center justify-center font-semibold">
                {i + 1}
              </span>
              <span className="text-sm text-neutral-600 leading-relaxed">{step}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function CtaBand() {
  return (
    <section className="px-6 pb-24 max-w-5xl mx-auto w-full reveal">
      <div className="relative overflow-hidden rounded-3xl border border-emerald-600/15 bg-gradient-to-br from-emerald-50 via-white to-teal-50 px-8 py-14 text-center">
        <h2 className="font-display text-3xl sm:text-4xl font-semibold tracking-tight text-neutral-900">
          See it run on Tempo.
        </h2>
        <p className="mt-3 text-neutral-600 max-w-md mx-auto">
          Set up a payroll, or claim a salary with a zero-knowledge proof generated in your browser.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/admin"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-7 py-3.5 text-sm font-semibold text-white shadow-sm transition-all active:scale-[0.98]"
          >
            Set up payroll <ArrowRight />
          </Link>
          <Link
            href="/claim"
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-neutral-300 bg-white hover:border-neutral-400 hover:bg-neutral-50 px-7 py-3.5 text-sm font-semibold text-neutral-700 hover:text-neutral-900 transition-all active:scale-[0.98]"
          >
            Claim your salary <ArrowRight />
          </Link>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-neutral-200 px-6 py-10">
      <div className="max-w-6xl mx-auto w-full flex flex-col sm:flex-row items-center justify-between gap-4">
        <Wordmark size="text-xl" />
        <p className="text-xs text-neutral-500 text-center sm:text-right">
          ZK private payroll on Tempo testnet · Built with Noir.
        </p>
      </div>
    </footer>
  );
}

export default function Home() {
  return (
    <div className="flex flex-col flex-1">
      <Hero />
      <FlowDiagram />
      <Pillars />
      <HowItWorks />
      <CtaBand />
      <Footer />
    </div>
  );
}
