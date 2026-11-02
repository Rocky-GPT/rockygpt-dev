import { proxyBrainDev } from '@/lib/brain-proxy';

export const dynamic = 'force-dynamic';

export function GET() {
  return proxyBrainDev('/v1/dev/offices');
}
