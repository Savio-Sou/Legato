import Link from "next/link";

const LockIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25z" />
  </svg>
);

const ChipIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 0 0 2.25-2.25V6.75a2.25 2.25 0 0 0-2.25-2.25H6.75A2.25 2.25 0 0 0 4.5 6.75v10.5a2.25 2.25 0 0 0 2.25 2.25zm.75-12h9v9h-9v-9z" />
  </svg>
);

const ShieldIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
  </svg>
);

const ArrowRight = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
  </svg>
);

const features = [
  {
    icon: <LockIcon />,
    color: "emerald" as const,
    title: "Privacy by default",
    desc: "Only you know your salary. The on-chain proof reveals nothing about the amount.",
  },
  {
    icon: <ChipIcon />,
    color: "blue" as const,
    title: "In-browser proving",
    desc: "Your browser runs the ZK prover locally using NoirJS + Barretenberg WASM.",
  },
  {
    icon: <ShieldIcon />,
    color: "amber" as const,
    title: "On-chain verification",
    desc: "The Solidity verifier checks the proof before releasing any funds.",
  },
];

const iconClasses: Record<string, string> = {
  emerald: "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20",
  blue: "bg-blue-500/10 text-blue-600 border border-blue-500/20",
  amber: "bg-amber-500/10 text-amber-600 border border-amber-500/20",
};

const steps = [
  "HR enters employee addresses + salaries — builds a Merkle tree on-chain.",
  "Employee connects their Tempo Wallet — browser fetches their private Merkle path.",
  "Browser generates a ZK proof (\"I'm in the tree\") without revealing salary on-chain.",
  "Smart contract verifies the proof and pays out pathUSD directly to the employee.",
];

export default function Home() {
  return (
    <div className="flex flex-col flex-1 items-center justify-center px-6 py-24">
      <div className="max-w-2xl w-full space-y-10 text-center">

        {/* Hero */}
        <div className="space-y-5">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-600/30 bg-emerald-500/10 px-4 py-1.5 text-sm font-medium text-emerald-700 tracking-wide">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Powered by Noir + Tempo Testnet
          </div>

          <h1 className="text-5xl font-bold tracking-tight text-neutral-900 leading-tight">
            Private Payroll{" "}
            <span className="bg-gradient-to-r from-emerald-500 to-teal-500 bg-clip-text text-transparent">
              Demo
            </span>
          </h1>

          <p className="text-lg text-neutral-600 max-w-xl mx-auto leading-relaxed">
            Employees receive their salary without revealing the amount to anyone
            on-chain — verified by a ZK proof, paid in{" "}
            <span className="text-neutral-900 font-medium">pathUSD</span> on Tempo.
          </p>
        </div>

        {/* Feature cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-left">
          {features.map((item) => (
            <div
              key={item.title}
              className="rounded-xl border border-neutral-200 bg-white p-5 space-y-3 shadow-sm hover:border-neutral-300 transition-colors duration-200"
            >
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${iconClasses[item.color]}`}>
                {item.icon}
              </div>
              <h3 className="font-semibold text-neutral-900 text-sm">{item.title}</h3>
              <p className="text-sm text-neutral-600 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>

        {/* CTA buttons */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/admin"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-7 py-3.5 text-sm font-semibold text-white shadow-sm transition-all duration-200 active:scale-[0.98]"
          >
            HR Admin <ArrowRight />
          </Link>
          <Link
            href="/claim"
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-neutral-300 bg-white hover:border-neutral-400 hover:bg-neutral-50 px-7 py-3.5 text-sm font-semibold text-neutral-700 hover:text-neutral-900 transition-all duration-200 active:scale-[0.98]"
          >
            Employee Claim <ArrowRight />
          </Link>
        </div>

        {/* How it works */}
        <div className="rounded-xl border border-neutral-200 bg-white p-6 text-left shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500 mb-4">
            How it works
          </p>
          <ol className="space-y-3">
            {steps.map((step, i) => (
              <li key={i} className="flex gap-3 items-start text-sm">
                <span className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full bg-emerald-500/10 border border-emerald-600/30 text-emerald-700 text-xs flex items-center justify-center font-semibold">
                  {i + 1}
                </span>
                <span className="text-neutral-600 leading-relaxed">{step}</span>
              </li>
            ))}
          </ol>
        </div>

      </div>
    </div>
  );
}
