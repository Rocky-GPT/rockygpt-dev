import { proxyBrainProbe } from '@/lib/brain-proxy';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ operation: string }> }) {
  const { operation } = await context.params;
  if (!['collections', 'browse', 'record', 'value'].includes(operation)) return Response.json({ error: 'Unknown graph operation.' }, { status: 404 });
  const incoming = new URL(request.url).searchParams;
  const query = new URLSearchParams();
  for (const key of ['dataset_version', 'collection', 'entity_id', 'group_by', 'filters', 'offset', 'limit', 'record_id', 'source_key', 'source_record_key', 'source_record_id', 'path']) {
    const value = incoming.get(key);
    if (value !== null) query.set(key, value);
  }
  return proxyBrainProbe(`/v1/dev/graph/${operation}?${query}`);
}
