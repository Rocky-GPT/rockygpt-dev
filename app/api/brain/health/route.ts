import { proxyBrain } from '@/lib/brain-proxy';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return proxyBrain(request, '/health');
}
