/**
 * @module api/brain/readiness/chat-logs
 * The chat-log store on its own. Unlike /readiness, this one does answer 503.
 */

import { proxyBrain } from '@/lib/brain-proxy';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return proxyBrain(request, '/readiness/chat-logs');
}
