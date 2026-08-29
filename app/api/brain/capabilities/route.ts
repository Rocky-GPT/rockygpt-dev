/**
 * @module api/brain/capabilities
 * The brain's registry, passed through unchanged.
 *
 * Deliberately a proxy and not a copy. The registry decides what the planner
 * may plan and what can actually run; a second list kept here would be a second
 * thing to keep in step, and the first time it drifted this app would be
 * describing lookups Rocky no longer has.
 */

import { proxyBrain } from '@/lib/brain-proxy';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return proxyBrain(request, '/v1/capabilities');
}
