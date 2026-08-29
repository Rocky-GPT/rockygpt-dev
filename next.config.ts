import type { NextConfig } from 'next';
import { buildSecurityHeaders } from './lib/security-headers';

/**
 * Everything this app shows arrives over HTTP from the brain, so Next needs no
 * sibling tracing, transpilation, or database-driver exceptions.
 *
 * The student UI's `allowedDevOrigins` is deliberately absent: that exists so a
 * phone on the local network can open the chat page, and it puts an interface
 * enumeration in the config load path. Nobody opens a control room on a phone.
 */
const nextConfig: NextConfig = {
  poweredByHeader: false,
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
