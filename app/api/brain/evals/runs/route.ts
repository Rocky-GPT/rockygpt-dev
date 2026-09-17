import { NextRequest, NextResponse } from 'next/server';
import { brainAddress } from '@/lib/brain-address';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { url } = brainAddress();
  if (!url) {
    return NextResponse.json({ runs: [], total: 0, error: 'Brain URL not configured' }, { status: 503 });
  }
  try {
    const search = request.nextUrl.search;
    const res = await fetch(`${url}/v1/evals/runs${search}`, { cache: 'no-store' });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    return NextResponse.json({ runs: [], total: 0, error: String(error) }, { status: 502 });
  }
}

export async function POST(request: NextRequest) {
  const { url } = brainAddress();
  if (!url) {
    return NextResponse.json({ success: false, error: 'Brain URL not configured' }, { status: 503 });
  }
  try {
    const body = await request.json();
    const res = await fetch(`${url}/v1/evals/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 502 });
  }
}
