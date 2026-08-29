import type { Metadata } from 'next';
import Link from 'next/link';
import { MessageSquareCode, ScrollText } from 'lucide-react';
import { PageHeader } from '@/components/shell/PageHeader';
import { StatusPill, type PillTone } from '@/components/shell/StatusPill';
import { hasAdminToken } from '@/lib/brain-address';
import { readBrain } from '@/lib/brain-proxy';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'RockyGPT Dev',
  description: 'Health, capabilities, and traffic at a glance.',
};

interface Readiness {
  status?: string;
  failing?: string[];
  degraded?: string[];
}

/** Serialized camelCase, unlike the log rows beside them, which are snake_case. */
interface LogMetrics {
  totalLogs?: number;
  avgLatencyMs?: number;
  uniqueSessions?: number;
  uniqueVisitors?: number;
  clientCount?: number;
  devCount?: number;
  botCount?: number;
}

export default async function OverviewPage() {
  const [readiness, capabilities, logs] = await Promise.all([
    readBrain<Readiness>('/readiness'),
    readBrain<{ capabilities: unknown[] }>('/v1/capabilities'),
    readBrain<{ metrics?: LogMetrics }>('/v1/admin/logs?limit=1', true),
  ]);

  // Absent, not null — the brain serializes readiness with `exclude_none`.
  const failing = readiness.data?.failing ?? [];
  const degraded = readiness.data?.degraded ?? [];
  const tone: PillTone = readiness.problem
    ? 'bad'
    : failing.length > 0
      ? 'bad'
      : degraded.length > 0
        ? 'warn'
        : 'ok';
  const label = readiness.problem
    ? 'Unreachable'
    : failing.length > 0
      ? 'Unready'
      : degraded.length > 0
        ? 'Degraded'
        : 'Ready';

  const metrics = logs.data?.metrics;

  return (
    <>
      <PageHeader
        title="Overview"
        subtitle="Everything below is read from the brain over HTTP"
        actions={<StatusPill tone={tone}>Brain · {label}</StatusPill>}
      />
      <main className="min-w-0 space-y-6 px-6 py-6">
        {readiness.problem && (
          <p className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 font-mono text-sm text-red-200">
            {readiness.problem}
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Tile label="Capabilities" value={capabilities.data?.capabilities.length ?? '—'} />
          <Tile label="Logged turns" value={metrics?.totalLogs ?? '—'} />
          <Tile
            label="Median latency"
            value={metrics?.avgLatencyMs !== undefined ? `${Math.round(metrics.avgLatencyMs)} ms` : '—'}
          />
          <Tile label="Unique visitors" value={metrics?.uniqueVisitors ?? '—'} />
        </div>

        {metrics && (
          <div className="grid gap-3 sm:grid-cols-3">
            <Tile label="From students" value={metrics.clientCount ?? '—'} />
            <Tile label="From dev tools" value={metrics.devCount ?? '—'} />
            <Tile label="From bots" value={metrics.botCount ?? '—'} />
          </div>
        )}

        {!hasAdminToken() && (
          <p className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
            <strong className="font-semibold">No admin token.</strong> Chat logs
            and the traffic counts above stay empty until{' '}
            <code className="font-mono">ADMIN_API_TOKEN</code> is set to match
            the brain’s own.
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Shortcut
            href="/brain/ask"
            icon={<MessageSquareCode className="h-4 w-4" />}
            title="Ask & Inspect"
            body="Send a question and read all four stages. The only place five of the eight trace boxes exist at all — they are never written to the database."
          />
          <Shortcut
            href="/quality/logs"
            icon={<ScrollText className="h-4 w-4" />}
            title="Chat Logs"
            body="What students actually asked, the route each turn took, and how long it took to answer."
          />
        </div>
      </main>
    </>
  );
}

function Tile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

function Shortcut({
  href,
  icon,
  title,
  body,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-2xl border border-white/10 bg-white/5 p-5 transition-colors hover:border-sky-400/30 hover:bg-sky-400/5"
    >
      <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
        {icon}
        {title}
      </span>
      <span className="mt-1.5 block text-xs leading-5 text-muted-foreground">{body}</span>
    </Link>
  );
}
