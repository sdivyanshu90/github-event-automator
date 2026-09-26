import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    serverActions: { bodySizeLimit: "64kb" },
    useTypeScriptCli: false,
  },
};

export default nextConfig;
