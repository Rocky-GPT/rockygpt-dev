import { proxyBrainProbe } from '@/lib/brain-proxy';

export const dynamic = 'force-dynamic';

/** A fresh authoritative snapshot; Explorer filters and pagination are never forwarded. */
export async function GET() {
  const response = await proxyBrainProbe('/v1/dev/graph/export', 30_000);
  if (!response.ok) return response;
  return new Response(response.body, { headers: {
    'Content-Type': 'application/json',
    'Content-Disposition': 'attachment; filename="campus-knowledge-graph.json"',
    'Cache-Control': 'no-store',
  } });
}
