import { NextRequest, NextResponse } from 'next/server';
import { brainAddress } from '@/lib/brain-address';

export const dynamic = 'force-dynamic';

interface RawLogEntry {
  timestamp?: string;
  requestId?: string;
  question?: string;
  messages?: Array<{ role: string; content: string }>;
  answer?: string | null;
  status?: string;
  elapsedMs?: number;
  citations?: Array<{ title: string; url: string }>;
  origin?: 'client' | 'dev' | 'bot';
}

export async function GET(request: NextRequest) {
  const { url: brainUrl } = brainAddress();
  if (!brainUrl) {
    return NextResponse.json({ error: 'Brain URL not configured' }, { status: 503 });
  }

  const searchParams = request.nextUrl.searchParams;
  const limitParam = parseInt(searchParams.get('limit') || '100', 10);
  const searchFilter = (searchParams.get('search') || '').toLowerCase();
  const originFilter = searchParams.get('origin')?.split(',').map((s) => s.trim()) || [];
  const routeFilter = searchParams.get('route')?.split(',').map((s) => s.trim().toLowerCase()) || [];
  const clientVersion = searchParams.get('version');

  try {
    const upstream = await fetch(`${brainUrl}/v1/logs?limit=500`, {
      headers: { accept: 'application/json' },
      cache: 'no-store',
    });

    if (!upstream.ok) {
      return NextResponse.json(
        { error: `Brain returned ${upstream.status}` },
        { status: upstream.status }
      );
    }

    const data = await upstream.json();
    const rawEntries: RawLogEntry[] = data.logs || [];

    // Map each raw entry to the ChatLogItem interface expected by LogsDashboard
    const allLogs = rawEntries.map((entry, idx) => {
      const id = entry.requestId || `turn-${idx}`;
      const status = entry.status || 'answered';
      const question = entry.question || (entry.messages && entry.messages[entry.messages.length - 1]?.content) || '';
      const answer = entry.answer || (status === 'answered' ? '' : `Status: ${status}`);
      const origin: 'client' | 'dev' | 'bot' = entry.origin || 'client';

      return {
        id,
        session_id: entry.requestId ? `sess-${entry.requestId.slice(0, 8)}` : `sess-${idx}`,
        visitor_id: entry.requestId ? `vis-${entry.requestId.slice(0, 8)}` : `vis-${idx}`,
        user_message: question,
        assistant_message: answer,
        route: status,
        question_origin: origin,
        tools_invoked: [],
        tool_arguments: {},
        citations: entry.citations || [],
        facts_extracted: [],
        latency_ms: entry.elapsedMs ?? 0,
        created_at: entry.timestamp || new Date().toISOString(),
      };
    });

    // Version watermark: based on the total count and latest item timestamp
    const latestTimestamp = allLogs[0]?.created_at || 'initial';
    const currentVersion = `${allLogs.length}-${latestTimestamp}`;

    if (clientVersion && clientVersion === currentVersion) {
      return NextResponse.json({ modified: false, version: currentVersion });
    }

    // Compute Metrics across all logs
    const totalLogs = allLogs.length;
    const avgLatencyMs = totalLogs > 0
      ? Math.round(allLogs.reduce((sum, l) => sum + l.latency_ms, 0) / totalLogs)
      : 0;
    const uniqueSessions = new Set(allLogs.map((l) => l.session_id)).size;
    const errorCount = allLogs.filter((l) => l.route !== 'answered').length;
    const clientCount = allLogs.filter((l) => l.question_origin === 'client').length;
    const devCount = allLogs.filter((l) => l.question_origin === 'dev').length;
    const botCount = allLogs.filter((l) => l.question_origin === 'bot').length;

    const metrics = {
      totalLogs,
      avgLatencyMs,
      uniqueSessions,
      errorCount,
      clientCount,
      devCount,
      botCount,
    };

    // Filter logs according to client params
    let filtered = allLogs;
    if (originFilter.length > 0) {
      filtered = filtered.filter((l) => originFilter.includes(l.question_origin));
    }
    if (routeFilter.length > 0) {
      filtered = filtered.filter((l) => routeFilter.some((r) => l.route.toLowerCase().includes(r)));
    }
    if (searchFilter) {
      filtered = filtered.filter(
        (l) =>
          l.user_message.toLowerCase().includes(searchFilter) ||
          l.assistant_message.toLowerCase().includes(searchFilter) ||
          l.id.toLowerCase().includes(searchFilter)
      );
    }

    return NextResponse.json({
      logs: filtered.slice(0, limitParam),
      metrics,
      version: currentVersion,
      total: totalLogs,
    });
  } catch (error) {
    console.error('Failed to proxy admin logs:', error);
    return NextResponse.json(
      { error: 'Failed to proxy chat logs from Brain' },
      { status: 500 }
    );
  }
}
