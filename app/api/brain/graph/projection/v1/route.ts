import { proxyBrainProbe } from '@/lib/brain-proxy';

export const dynamic = 'force-dynamic';

/** Additive inspection path used by the opt-in projection explorer. */
export async function GET(request: Request) {
  const incoming = new URL(request.url).searchParams;
  const query = new URLSearchParams();
  for (const key of ['dataset_version', 'identity_hash', 'entity_id', 'record_group', 'filters', 'limit', 'cursor']) {
    const value = incoming.get(key);
    if (value !== null) query.set(key, value);
  }
  return proxyBrainProbe(`/v1/dev/graph/projection/v1?${query}`);
}
