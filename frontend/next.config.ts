import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // Prevent Node-only modules from being bundled on the client side.
    // Turbopack handles WASM natively; no asyncWebAssembly flag needed.
    resolveAlias: {
      fs: { browser: "./src/lib/noop.ts" },
      net: { browser: "./src/lib/noop.ts" },
      tls: { browser: "./src/lib/noop.ts" },
      child_process: { browser: "./src/lib/noop.ts" },
    },
  },
};

export default nextConfig;
