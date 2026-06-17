import { createConfig, http } from "wagmi";
import { tempoTestnet } from "wagmi/chains";
import { webAuthn, dangerous_secp256k1 } from "wagmi/tempo";

// ─── Wallet connector ────────────────────────────────────────────────────────
// Default: Tempo's domain-bound WebAuthn passkey connector. The passkey ceremony
// runs TOP-LEVEL on this origin (no cross-origin iframe), client-only via a local
// ceremony — so "Create passkey" / "Sign in with passkey" work on localhost and
// across browsers (Chrome, Brave, Zen/Firefox, Safari), unlike the hosted
// tempoWallet() dialog which embeds wallet.tempo.xyz in a cross-origin iframe
// where browsers block the WebAuthn ceremony.
//
// Dev/test override: if NEXT_PUBLIC_DEV_PRIVATE_KEY is set, use a local secp256k1
// signer instead (no passkey at all) — instant connect in every browser and
// headless Playwright. Used by the E2E harness. TESTNET key only; it is inlined
// into the client bundle.
const devKey = process.env.NEXT_PUBLIC_DEV_PRIVATE_KEY as `0x${string}` | undefined;

export const wagmiConfig = createConfig({
  chains: [tempoTestnet],
  connectors: [
    devKey
      ? dangerous_secp256k1({ name: "Dev Wallet (Secp256k1)", privateKey: devKey })
      : webAuthn({ name: "Legato" }),
  ],
  transports: {
    [tempoTestnet.id]: http("https://rpc.moderato.tempo.xyz"),
  },
  ssr: true,
});

export { tempoTestnet };
