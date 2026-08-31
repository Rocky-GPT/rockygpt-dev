'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { StatusPill, type PillTone } from '@/components/shell/StatusPill';

interface ProbeBody {
  status?: string;
  error?: string;
  reason?: string;
}

interface Probe {
  reached: boolean;
  httpStatus?: number;
  body?: ProbeBody;
  misconfigured?: boolean;
  problem?: string;
}

const POLL_MS = 10_000;

async function probe(path: string): Promise<Probe> {
  try {
    const response = await fetch(path, { cache: 'no-store' });
    const body = (await response.json().catch(() => ({}))) as ProbeBody;
    if (body.reason === 'misconfigured') {
      return { reached: false, misconfigured: true, problem: body.error };
    }
    if (body.reason === 'unreachable') {
      return { reached: false, problem: body.error };
    }
    return { reached: true, httpStatus: response.status, body };
  } catch (error) {
    return { reached: false, problem: error instanceof Error ? error.message : String(error) };
  }
}

export function OperationsBoard() {
  const [readiness, setReadiness] = useState<Probe | null>(null);
  const [health, setHealth] = useState<Probe | null>(null);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [readinessProbe, healthProbe] = await Promise.all([
      probe('/api/brain/readiness'),
      probe('/api/brain/health'),
    ]);
    setReadiness(readinessProbe);
    setHealth(healthProbe);
    setCheckedAt(new Date().toLocaleTimeString());
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void refresh()}
          className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <RefreshCw className="h-3 w-3" />
          Refresh
        </button>
        {checkedAt && <span className="text-xs text-muted-foreground">Checked {checkedAt}</span>}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <ProbeCard title="Brain readiness" expected="ready" probe={readiness} />
        <ProbeCard title="Brain health" expected="ok" probe={health} />
        <CurrentSurfaceCard />
      </div>
    </div>
  );
}

function Card({
  title,
  tone,
  pill,
  children,
}: {
  title: string;
  tone: PillTone;
  pill: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <StatusPill tone={tone}>{pill}</StatusPill>
      </div>
      <div className="mt-3 space-y-1.5 text-xs text-muted-foreground">{children}</div>
    </section>
  );
}

function ProbeCard({
  title,
  expected,
  probe,
}: {
  title: string;
  expected: string;
  probe: Probe | null;
}) {
  if (!probe) return <Card title={title} tone="idle" pill="Checking…" />;
  if (!probe.reached) {
    return (
      <Card title={title} tone="bad" pill={probe.misconfigured ? 'Misconfigured' : 'Unreachable'}>
        <p className="font-mono">{probe.problem}</p>
      </Card>
    );
  }

  const ok = probe.httpStatus === 200 && probe.body?.status === expected;
  return (
    <Card title={title} tone={ok ? 'ok' : 'bad'} pill={ok ? 'Ready' : 'Unexpected'}>
      <Row label="HTTP" value={String(probe.httpStatus)} />
      <Row label="status" value={probe.body?.status ?? '—'} />
    </Card>
  );
}

function CurrentSurfaceCard() {
  return (
    <Card title="Current Brain surface" tone="idle" pill="Shell only">
      <Row label="GET" value="/health" />
      <Row label="GET" value="/readiness" />
      <p className="pt-1">Developer tools return as their clean-room contracts are rebuilt.</p>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted-foreground/70">{label}</span>
      <span className="truncate font-mono text-foreground/80">{value}</span>
    </div>
  );
}
