import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@kqa/ui", "@kqa/db", "@kqa/auth"],
};

export default nextConfig;
