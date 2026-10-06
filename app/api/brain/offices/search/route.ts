import { proxyBrainDev } from '@/lib/brain-proxy';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return proxyBrainDev('/v1/dev/offices/search', new URL(request.url).search);
}
