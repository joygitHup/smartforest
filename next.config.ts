import type { NextConfig } from 'next';

const backendUrl = (
  process.env.BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  'http://127.0.0.1:8000'
)
  .replace(/\/$/, '')
  .replace(/\/api$/, '');

const nextConfig: NextConfig = {
  // outputFileTracingRoot: path.resolve(__dirname, '../../'),  // Uncomment and add 'import path from "path"' if needed
  allowedDevOrigins: ['*.dev.coze.site', '172.20.128.1'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*',
        pathname: '/**',
      },
    ],
  },
  // 代理时强制目标带尾部斜杠，匹配 Django APPEND_SLASH
  async rewrites() {
    return [
      {
        source: '/api/:path*/',
        destination: `${backendUrl}/api/:path*/`,
      },
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*/`,
      },
    ];
  },
};

export default nextConfig;
