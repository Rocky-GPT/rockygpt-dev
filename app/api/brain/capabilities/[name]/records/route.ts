/**
 * @module api/brain/capabilities/[name]/records
 * The records one capability returns when nothing narrows it.
 *
 * A 400 from upstream is passed through rather than reworded: the brain's own
 * "There is no 'shuttle' capability." is more useful than anything this layer
 * could say, and it is the fastest way to learn that the registry name is
 * `transportation` and the alias does not resolve on this route.
 */

import { proxyBrain } from '@/lib/brain-proxy';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ name: string }> }) {
  const { name } = await context.params;
  return proxyBrain(request, `/v1/capabilities/${encodeURIComponent(name)}/records`);
}
