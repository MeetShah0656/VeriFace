import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Disable the X-Powered-By header for security
  poweredByHeader: false,

  // Required HTTP headers for onnxruntime-web (WASM + SharedArrayBuffer)
  // Cross-Origin-Opener-Policy and Cross-Origin-Embedder-Policy are mandatory
  // for SharedArrayBuffer to be available in modern browsers (used by ONNX WASM threads).
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin",
          },
          {
            key: "Cross-Origin-Embedder-Policy",
            value: "require-corp",
          },
        ],
      },
    ];
  },

  // Turbopack config (required for Next.js 16+ which defaults to Turbopack)
  turbopack: {},
};

export default nextConfig;

