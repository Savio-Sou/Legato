import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

// Social share card (og:image / twitter:image). Auto-wired to all routes
// because it lives at the app root. The wordmark + tagline are set in Fraunces
// (the brand display face, bundled as a TTF — Satori can't read the woff2 that
// next/font serves). The slur is an inline SVG data-URI <img>.

export const alt = "Legato — private payroll that flows. ZK-verified salaries, paid on Tempo.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  const fraunces = await readFile(join(process.cwd(), "assets/Fraunces-SemiBold.ttf"));

  const slurSvg =
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 240 26'>` +
    `<defs><linearGradient id='s' x1='0' y1='0' x2='240' y2='0' gradientUnits='userSpaceOnUse'>` +
    `<stop stop-color='#10B981'/><stop offset='1' stop-color='#14B8A6'/></linearGradient></defs>` +
    `<path d='M5 22C70 3 170 3 235 22 170 11 70 11 5 22Z' fill='url(#s)'/></svg>`;
  const slurSrc = `data:image/svg+xml,${encodeURIComponent(slurSvg)}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#fafafa",
          backgroundImage:
            "radial-gradient(ellipse 90% 55% at 50% 0%, rgba(16,185,129,0.20), transparent 60%)",
          fontFamily: "sans-serif",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={slurSrc} width={372} height={40} alt="" />
        <div style={{ fontFamily: "Fraunces", fontSize: 140, fontWeight: 600, color: "#0b1f17", marginTop: 4, letterSpacing: -3 }}>
          Legato
        </div>
        <div style={{ display: "flex", fontFamily: "Fraunces", fontSize: 54, fontWeight: 600, marginTop: 8 }}>
          <span style={{ color: "#1f2937" }}>Private payroll that&nbsp;</span>
          <span style={{ color: "#10b981" }}>flows.</span>
        </div>
        <div style={{ fontSize: 28, color: "#6b7280", marginTop: 22 }}>
          ZK-verified salaries, paid in pathUSD on Tempo.
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginTop: 44,
            padding: "10px 22px",
            border: "1px solid rgba(16,185,129,0.35)",
            borderRadius: 999,
            color: "#047857",
            fontSize: 24,
          }}
        >
          <div style={{ width: 11, height: 11, borderRadius: 999, backgroundColor: "#10b981" }} />
          Powered by Noir + Tempo
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [{ name: "Fraunces", data: fraunces, style: "normal", weight: 600 }],
    },
  );
}
