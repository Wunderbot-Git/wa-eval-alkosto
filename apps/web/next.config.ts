import type { NextConfig } from 'next'

const API_URL = process.env.BACKEND_URL || 'http://localhost:3001'

const nextConfig: NextConfig = {
  output: 'standalone',
  transpilePackages: ['@eval/shared'],
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${API_URL}/:path*`,
      },
    ]
  },
}

export default nextConfig
