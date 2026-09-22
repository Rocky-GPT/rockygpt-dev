import os from 'node:os';
import type { NextConfig } from 'next';
import { buildSecurityHeaders } from './lib/security-headers';

function devOrigins(): string[] {
  const localIps = Object.values(os.networkInterfaces())
    .flat()
    .flatMap((details) =>
      details && !details.internal && details.family === 'IPv4'
        ? [details.address, `${details.address}:3100`]
        : []
    );
  return ['127.0.0.1', '127.0.0.1:3100', 'localhost', 'localhost:3100', ...localIps];
}

const nextConfig: NextConfig = {
  poweredByHeader: false,
  agentRules: false,
  allowedDevOrigins: devOrigins(),
  async headers() {
    return [
      {
        source: '/:path*',
        headers: buildSecurityHeaders(),
      },
    ];
  },
};

export default nextConfig;
