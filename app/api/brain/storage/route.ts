import type { NextRequest } from 'next/server';
import { productionBrainAddress } from '@/lib/brain-address';
import { proxyBrainProbe } from '@/lib/brain-proxy';

export const dynamic = 'force-dynamic';

// Counting passages reads the whole passage table, and the hosted database may
// have to wake up first.
const STORAGE_TIMEOUT_MS = 20_000;

export function GET(request: NextRequest) {
  return request.nextUrl.searchParams.get('target') === 'production'
    ? proxyBrainProbe('/v1/storage', STORAGE_TIMEOUT_MS, productionBrainAddress())
    : proxyBrainProbe('/v1/storage', STORAGE_TIMEOUT_MS);
}
