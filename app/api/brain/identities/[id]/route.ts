import { proxyBrainProbe } from '@/lib/brain-proxy';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const incoming = new URL(request.url).searchParams;
  const query = new URLSearchParams();
  for (const key of ['date', 'meal', 'include', 'menu_limit', 'dataset_version']) {
    const value = incoming.get(key);
    if (value !== null) query.set(key, value);
  }
  return proxyBrainProbe(`/v1/dev/identities/${encodeURIComponent(id)}?${query}`);
}
