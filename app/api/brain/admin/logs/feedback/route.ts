import { NextRequest, NextResponse } from 'next/server';
import { brainAddress } from '@/lib/brain-address';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { logId, feedback } = body;
    console.log('[Dev Control Room] Operator feedback submitted:', body);

    const { url } = brainAddress();
    if (url && logId && feedback) {
      try {
        await fetch(`${url}/v1/feedback`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requestId: logId,
            rating: feedback === 'positive' ? 1 : -1,
            category: 'operator_review',
            comments: 'Reviewed in Dev Control Room',
          }),
        });
      } catch (e) {
        console.warn('Failed to forward operator feedback to brain DB:', e);
      }
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Invalid feedback payload' }, { status: 400 });
  }
}
