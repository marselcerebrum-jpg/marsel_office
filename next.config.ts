import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // data/*.json dibaca saat runtime oleh server; pastikan ikut ke build standalone.
  outputFileTracingIncludes: {
    "/**": ["./data/*.json"],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
