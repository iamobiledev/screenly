import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Standalone output is only needed for the Docker image; platforms like
  // Vercel use their own build output. The Dockerfile sets this flag.
  output: process.env.NEXT_OUTPUT_STANDALONE === "1" ? "standalone" : undefined,
  // The pnpm-workspace tracing root is only correct when building inside the
  // monorepo (local dev, Docker). On Vercel it breaks file collection.
  outputFileTracingRoot:
    process.env.VERCEL === "1" ? undefined : path.join(process.cwd(), "../.."),
};

export default nextConfig;
