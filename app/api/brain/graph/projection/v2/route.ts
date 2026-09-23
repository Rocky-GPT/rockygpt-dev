import { proxyBrainProbe } from '@/lib/brain-proxy';

export const dynamic = 'force-dynamic';

/** The projection the Campus Graph explorer shows for each entity. */
export async function GET(request: Request) {
  const incoming = new URL(request.url).searchParams;
  const query = new URLSearchParams();
  for (const key of ['dataset_version', 'identity_hash', 'entity_id', 'record_group', 'filters', 'limit', 'cursor']) {
    const value = incoming.get(key);
    if (value !== null) query.set(key, value);
  }
  return proxyBrainProbe(`/v1/dev/graph/projection/v2?${query}`);
}
