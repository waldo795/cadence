import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Collects a minimal server into .next/standalone for the container image.
  output: "standalone",
};

export default nextConfig;
