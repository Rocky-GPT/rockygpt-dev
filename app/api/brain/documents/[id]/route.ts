import { NextRequest } from 'next/server';
import { proxyBrainProbe } from '@/lib/brain-proxy';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  return proxyBrainProbe(`/v1/documents/${encodeURIComponent(id)}`);
}
