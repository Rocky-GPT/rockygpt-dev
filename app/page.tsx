import type { Metadata } from 'next';
import Link from 'next/link';
import { Gauge, MessageSquareCode } from 'lucide-react';
import { PageHeader } from '@/components/shell/PageHeader';
import { StatusPill, type PillTone } from '@/components/shell/StatusPill';
import { readBrainProbe } from '@/lib/brain-proxy';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'RockyGPT Dev',
  description: 'Clean-room Brain connection at a glance.',
};

interface ProbeBody {
  status?: string;
}

export default async function OverviewPage() {
  const [health, readiness] = await Promise.all([
    readBrainProbe<ProbeBody>('/health'),
    readBrainProbe<ProbeBody>('/readiness'),
  ]);

  const problem = readiness.problem ?? health.problem;
  const ready = !problem && health.data?.status === 'ok' && readiness.data?.status === 'ready';
  const tone: PillTone = ready ? 'ok' : 'bad';

  return (
    <>
      <PageHeader
        title="Overview"
        subtitle="The current clean-room Brain shell over HTTP"
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
          <Tile label="HTTP surface" value="3 endpoints" />
          <Tile label="Build phase" value="Chat shell" />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Shortcut
            href="/operations/health"
            icon={<Gauge className="h-4 w-4" />}
            title="Service Health"
            body="Watch the clean-room Brain’s liveness and readiness probes."
          />
          <Shortcut
            href="/brain/ask"
            icon={<MessageSquareCode className="h-4 w-4" />}
            title="Ask & Inspect"
            body="Send a message through the clean-room Brain and inspect the fixed response."
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
