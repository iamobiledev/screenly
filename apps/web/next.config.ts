import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Standalone output is only needed for the Docker image; platforms like
  // Vercel use their own build output. The Dockerfile sets this flag.
  output: process.env.NEXT_OUTPUT_STANDALONE === "1" ? "standalone" : undefined,
  outputFileTracingRoot: path.join(process.cwd(), "../.."),
};

export default nextConfig;
