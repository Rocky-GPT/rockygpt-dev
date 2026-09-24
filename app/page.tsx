import type { Metadata } from 'next';
import Link from 'next/link';
import { Gauge, MessageSquareCode } from 'lucide-react';
import { PageHeader } from '@/components/shell/PageHeader';
import { StatusPill, type PillTone } from '@/components/shell/StatusPill';
import { readBrainProbe } from '@/lib/brain-proxy';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'RockyGPT Dev',
  description: 'Brain connection and student assistant tools at a glance.',
};

interface ProbeBody {
  status?: string;
}

interface OpenApiSchema {
  paths?: Record<string, Record<string, unknown>>;
}

export default async function OverviewPage() {
  const [health, readiness, schema] = await Promise.all([
    readBrainProbe<ProbeBody>('/health'),
    readBrainProbe<ProbeBody>('/readiness'),
    readBrainProbe<OpenApiSchema>('/openapi.json'),
  ]);
  // Counted from the Brain's own schema; a typed-in "3 endpoints" went stale
  // as soon as the Brain grew logs, feedback, evals and panel routes.
  const routeCount = schema.data?.paths
    ? Object.values(schema.data.paths).reduce((total, methods) => total + Object.keys(methods).length, 0)
    : null;

  const problem = readiness.problem ?? health.problem;
  const ready = !problem && health.data?.status === 'ok' && readiness.data?.status === 'ready';
  const tone: PillTone = ready ? 'ok' : 'bad';

  return (
    <>
      <PageHeader
        title="Overview"
        subtitle="The student assistant over HTTP"
        actions={<StatusPill tone={tone}>Brain · {ready ? 'Ready' : 'Unavailable'}</StatusPill>}
      />
      <main className="min-w-0 space-y-6 px-6 py-6">
        {problem && (
          <p className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 font-mono text-sm text-red-200">
            {problem}
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Tile label="Brain health" value={health.data?.status ?? '—'} />
          <Tile label="Brain readiness" value={readiness.data?.status ?? '—'} />
          <Tile label="Brain routes" value={routeCount === null ? '—' : String(routeCount)} />
          <Tile label="Assistant" value="Campus + study help" />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Shortcut
            href="/operations/health"
            icon={<Gauge className="h-4 w-4" />}
            title="Service Health"
            body="Watch the Brain’s liveness and readiness probes."
          />
          <Shortcut
            href="/brain/ask"
            icon={<MessageSquareCode className="h-4 w-4" />}
            title="Ask & Inspect"
            body="Ask student questions and inspect answers, sources, and tool calls."
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
