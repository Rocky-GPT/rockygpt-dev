import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    // Log operator feedback to stdout / terminal
    console.log('[Dev Control Room] Operator feedback submitted:', body);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Invalid feedback payload' }, { status: 400 });
  }
}
