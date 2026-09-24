import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ['sharp'],
  outputFileTracingIncludes: {
    '/**': ['./node_modules/@img/**/*'],
  },
};

export default nextConfig;
