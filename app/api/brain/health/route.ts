import { proxyBrainProbe } from '@/lib/brain-proxy';

export const dynamic = 'force-dynamic';

export function GET() {
  return proxyBrainProbe('/health');
}
