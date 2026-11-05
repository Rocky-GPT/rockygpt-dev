import { proxyBrainDev } from '@/lib/brain-proxy';

export const dynamic = 'force-dynamic';

/** This month's spending allowance on the laptop Brain: allowed, spent, held and left. */
export function GET() {
  return proxyBrainDev('/v1/dev/budget');
}
