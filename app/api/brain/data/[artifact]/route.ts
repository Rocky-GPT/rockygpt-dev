/**
 * @module api/brain/data/[artifact]
 * Published campus artifacts.
 *
 * The allowlist mirrors the brain's own `PUBLIC_ARTIFACTS`. Keeping it here too
 * means an unknown key is a 404 from this app rather than a round trip that
 * ends in one.
 */

import { ARTIFACT_SET } from '@/lib/brain-routes';
import { proxyBrain } from '@/lib/brain-proxy';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ artifact: string }> }) {
  const { artifact } = await context.params;
  if (!ARTIFACT_SET.has(artifact)) {
    return Response.json({ error: `Unknown data artifact "${artifact}".` }, { status: 404 });
  }
  return proxyBrain(request, `/v1/data/${encodeURIComponent(artifact)}`);
}
