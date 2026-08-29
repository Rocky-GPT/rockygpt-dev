'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { StatusPill, type PillTone } from '@/components/shell/StatusPill';

/**
 * The brain's readiness shape.
 *
 * `failing` and `degraded` are optional because the brain serializes with
 * `exclude_none` — they are *absent* when empty, not null, so anything that
 * reaches for `.length` without a fallback throws on a healthy brain.
 */
interface Readiness {
  status?: string;
  failing?: string[];
  degraded?: string[];
  timestamp?: string;
}

interface Probe {
  /** Whether this app could reach the brain at all. */
  reached: boolean;
  httpStatus?: number;
  body?: Readiness & Record<string, unknown>;
  /** Set when the address itself is the problem, not the service. */
  misconfigured?: boolean;
  problem?: string;
}

const POLL_MS = 10_000;

async function probe(path: string): Promise<Probe> {
  try {
    const response = await fetch(path, { cache: 'no-store' });
    const body = (await response.json().catch(() => ({}))) as Readiness & Record<string, unknown>;
    // A 503 carrying `reason: 'misconfigured'` is this app's own refusal — the
    // brain was never given an address — not the brain answering unready. They
    // need different fixes: one is a deploy, the other a restart.
    if (body.reason === 'misconfigured') {
      return { reached: false, misconfigured: true, problem: String(body.error ?? '') };
    }
    if (body.reason === 'unreachable') {
      return { reached: false, problem: String(body.error ?? '') };
    }
    return { reached: true, httpStatus: response.status, body };
  } catch (error) {
    return { reached: false, problem: error instanceof Error ? error.message : String(error) };
  }
}

export function OperationsBoard({ adminTokenConfigured }: { adminTokenConfigured: boolean }) {
  const [readiness, setReadiness] = useState<Probe | null>(null);
  const [chatLogs, setChatLogs] = useState<Probe | null>(null);
  const [health, setHealth] = useState<Probe | null>(null);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [a, b, c] = await Promise.all([
      probe('/api/brain/readiness'),
      probe('/api/brain/readiness/chat-logs'),
      probe('/api/brain/health'),
    ]);
    setReadiness(a);
    setChatLogs(b);
    setHealth(c);
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
        <BrainReadinessCard probe={readiness} />
        <ChatLogCard probe={chatLogs} />
        <ConfigCard probe={health} adminTokenConfigured={adminTokenConfigured} />
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

/**
 * Brain readiness, judged on the body rather than the status code.
 *
 * The brain answers 200 while `degraded` is non-empty, deliberately: a chat-log
 * outage must not take the site down. A card driven by `response.ok` therefore
 * shows green while logging is dead — which is the exact invisible outage the
 * degraded field was added to surface. Amber is its own state here, not a shade
 * of red, because "serving but something is broken" is genuinely a third thing.
 */
function BrainReadinessCard({ probe }: { probe: Probe | null }) {
  if (!probe) return <Card title="Brain readiness" tone="idle" pill="Checking…" />;

  if (probe.misconfigured) {
    return (
      <Card title="Brain readiness" tone="bad" pill="Misconfigured">
        <p>{probe.problem}</p>
        <p className="text-muted-foreground/70">A deploy fixes this, not a restart.</p>
      </Card>
    );
  }
  if (!probe.reached) {
    return (
      <Card title="Brain readiness" tone="bad" pill="Unreachable">
        <p className="font-mono">{probe.problem}</p>
      </Card>
    );
  }

  const failing = probe.body?.failing ?? [];
  const degraded = probe.body?.degraded ?? [];
  const tone: PillTone = failing.length > 0 ? 'bad' : degraded.length > 0 ? 'warn' : 'ok';
  const pill = failing.length > 0 ? 'Unready' : degraded.length > 0 ? 'Degraded' : 'Ready';

  return (
    <Card title="Brain readiness" tone={tone} pill={pill}>
      <Row label="HTTP" value={String(probe.httpStatus)} />
      <Row label="status" value={probe.body?.status ?? '—'} />
      <Row label="failing" value={failing.length ? failing.join(', ') : 'none'} />
      <Row label="degraded" value={degraded.length ? degraded.join(', ') : 'none'} />
      {degraded.length > 0 && (
        <p className="pt-1 text-amber-300/80">
          Still answering 200 on purpose — a log outage must not take the site down.
        </p>
      )}
    </Card>
  );
}

function ChatLogCard({ probe }: { probe: Probe | null }) {
  if (!probe) return <Card title="Chat-log store" tone="idle" pill="Checking…" />;
  if (!probe.reached) {
    return (
      <Card title="Chat-log store" tone="bad" pill={probe.misconfigured ? 'Misconfigured' : 'Unreachable'}>
        <p className="font-mono">{probe.problem}</p>
      </Card>
    );
  }
  // This one does answer 503, unlike /readiness. It is the dedicated target for
  // an uptime monitor.
  const ok = probe.httpStatus === 200;
  return (
    <Card title="Chat-log store" tone={ok ? 'ok' : 'bad'} pill={ok ? 'Persisting' : 'Degraded'}>
      <Row label="HTTP" value={String(probe.httpStatus)} />
      <Row label="status" value={probe.body?.status ?? '—'} />
      {!ok && <p className="pt-1">Turns are still answered; they are not being written.</p>}
    </Card>
  );
}

function ConfigCard({
  probe,
  adminTokenConfigured,
}: {
  probe: Probe | null;
  adminTokenConfigured: boolean;
}) {
  const uptime = typeof probe?.body?.uptime === 'number' ? probe.body.uptime : undefined;
  return (
    <Card
      title="This app"
      tone={adminTokenConfigured ? 'ok' : 'warn'}
      pill={adminTokenConfigured ? 'Configured' : 'No admin token'}
    >
      <Row label="brain reachable" value={probe?.reached ? 'yes' : 'no'} />
      {uptime !== undefined && <Row label="brain uptime" value={`${Math.round(uptime)}s`} />}
      {/* Boolean only, never the value. A blank token is the most likely
          reason the Logs page is empty, and it is otherwise invisible. */}
      <Row label="ADMIN_API_TOKEN" value={adminTokenConfigured ? 'set' : 'not set'} />
      {!adminTokenConfigured && (
        <p className="pt-1 text-amber-300/80">
          Chat logs will be empty until this is set to match the brain’s own token.
        </p>
      )}
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
