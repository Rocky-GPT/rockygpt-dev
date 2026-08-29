import { proxyBrain } from '@/lib/brain-proxy';

export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  return proxyBrain(request, '/v1/admin/logs/feedback', { admin: true });
}
