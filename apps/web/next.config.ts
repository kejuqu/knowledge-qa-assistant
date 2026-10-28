import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@kqa/ui", "@kqa/db", "@kqa/auth", "@kqa/ai"],
  serverExternalPackages: ["@zilliz/milvus2-sdk-node", "postgres"],
};

export default nextConfig;
