import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // This example lives inside the library's repository, which has its own lockfile.
  turbopack: { root: __dirname },
  outputFileTracingRoot: __dirname,
}

export default nextConfig
