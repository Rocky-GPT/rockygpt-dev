/**
 * @module api/brain/readiness
 * Whether the brain can serve.
 *
 * Passed through with its status code intact, including the 503. The body *is*
 * the payload here — it names which subsystem failed — so a handler that turned
 * a non-2xx into a thrown error would discard the only useful part.
 *
 * Two things a caller must know about the shape upstream: the brain serializes
 * with `exclude_none`, so `failing` and `degraded` are absent rather than null;
 * and a degraded brain still answers 200, deliberately, because a chat-log
 * outage must not take the site down. Reading `response.ok` alone reports a
 * healthy brain while logging is dead.
 */

import { proxyBrain } from '@/lib/brain-proxy';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return proxyBrain(request, '/readiness');
}
