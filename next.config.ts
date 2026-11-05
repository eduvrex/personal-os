import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root to this project. A stray lockfile in the home
  // directory otherwise makes Next infer the wrong root for build file tracing.
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
