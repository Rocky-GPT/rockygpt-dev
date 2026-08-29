/**
 * @module api/brain/chat
 * One turn, forwarded whole.
 *
 * The student UI's chat route validates, bounds, rate-limits, and owns a
 * visitor cookie. None of that belongs here: a control room wants to set
 * `visitorId` freely, must not be throttled mid-bulk-run, and needs the brain's
 * own refusal rather than one this app invented.
 *
 * The origin stamp is set twice on purpose. The brain resolves
 * `body.question_origin or origin_header or "client"`, so the body wins — and a
 * body built wrong would silently be counted as student traffic in the very log
 * metrics this app renders. The header catches that.
 */

import { proxyBrain } from '@/lib/brain-proxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  return proxyBrain(request, '/v1/chat', {
    headers: { 'x-rockygpt-origin': 'dev' },
  });
}
