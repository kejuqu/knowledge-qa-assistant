import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["auth.lvh.me"],
  transpilePackages: ["@kqa/ui", "@kqa/db", "@kqa/auth"],
};

export default nextConfig;
