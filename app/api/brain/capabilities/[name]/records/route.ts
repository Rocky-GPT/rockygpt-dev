import { NextRequest } from 'next/server';
import { proxyBrainProbe } from '@/lib/brain-proxy';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ name: string }> }
) {
  const { name } = await context.params;
  return proxyBrainProbe(`/v1/capabilities/${encodeURIComponent(name)}/records`);
}
