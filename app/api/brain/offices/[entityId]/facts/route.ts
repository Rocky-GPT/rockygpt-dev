import { proxyBrainDev } from '@/lib/brain-proxy';

export const dynamic = 'force-dynamic';

/** An office's facts as the shared reader returns them. Needs `dataset_version` and `identity_hash`. */
export async function GET(request: Request, context: { params: Promise<{ entityId: string }> }) {
  const { entityId } = await context.params;
  return proxyBrainDev(`/v1/entities/${encodeURIComponent(entityId)}/facts`, new URL(request.url).search);
}
