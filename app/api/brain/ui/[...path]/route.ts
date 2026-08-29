/**
 * @module api/brain/ui/[...path]
 * The brain's shaped campus routes, behind one allowlisted passthrough.
 *
 * These six are the routes the student app consumes directly. They are worth a
 * page here because two of them take a date and refuse a malformed one, which
 * makes them the cheapest way to exercise the brain's error path.
 */

import { UI_ROUTE_SET } from '@/lib/brain-routes';
import { proxyBrain } from '@/lib/brain-proxy';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const joined = path.join('/');
  if (!UI_ROUTE_SET.has(joined)) {
    return Response.json({ error: `Unknown campus route "${joined}".` }, { status: 404 });
  }
  const query = new URL(request.url).search;
  return proxyBrain(request, `/v1/${joined}${query}`);
}
