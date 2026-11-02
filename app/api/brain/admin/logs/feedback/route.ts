import { NextRequest, NextResponse } from 'next/server';
import { brainAddress } from '@/lib/brain-address';

export const dynamic = 'force-dynamic';

/**
 * An operator's thumb on a logged turn.
 *
 * This answered { ok: true } whatever happened, and it reused the turn's
 * request ID, so it silently replaced a student's own rating and comment.
 * The Brain now refuses that (student_feedback_exists) and this route passes
 * the outcome through, so the dashboard can say what happened.
 */
export async function POST(request: NextRequest) {
  let body: { logId?: unknown; feedback?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid feedback payload' }, { status: 400 });
  }
  const { logId, feedback } = body;
  if (typeof logId !== 'string' || (feedback !== 'positive' && feedback !== 'negative')) {
    return NextResponse.json({ ok: false, error: 'Send a turn ID and a positive or negative review' }, { status: 400 });
  }

  const { url } = brainAddress();
  if (!url) {
    return NextResponse.json({ ok: false, error: 'Brain URL not configured' }, { status: 503 });
  }

  try {
    const upstream = await fetch(`${url}/v1/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestId: logId,
        rating: feedback === 'positive' ? 1 : -1,
        category: 'operator_review',
        comments: 'Reviewed in Dev Control Room',
      }),
    });
    const result = (await upstream.json().catch(() => ({}))) as {
      success?: boolean;
      error?: string;
      message?: string;
    };
    if (!upstream.ok || result.success !== true) {
      return NextResponse.json(
        { ok: false, error: result.message || result.error || `Brain returned ${upstream.status}` },
        { status: result.error === 'student_feedback_exists' ? 409 : 502 }
      );
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.warn('Failed to forward operator feedback to the Brain:', error);
    return NextResponse.json({ ok: false, error: 'The Brain could not be reached' }, { status: 502 });
  }
}
