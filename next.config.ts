import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    domains: ['placehold.co'],
    unoptimized: true,
  },
};

export default nextConfig;
