import type { NextConfig } from 'next';

// Static export for GitHub Pages. NEXT_PUBLIC_BASE_PATH is '/beer-game' in CI and empty locally.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  ...(basePath ? { basePath, assetPrefix: basePath } : {}),
};

export default nextConfig;
