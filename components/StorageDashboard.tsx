'use client';

import { useCallback, useEffect, useState } from 'react';
import { Cloud, Laptop, RefreshCw, type LucideIcon } from 'lucide-react';
import { PageHeader } from '@/components/shell/PageHeader';
import {
  NEON_FREE_STORAGE_BYTES,
  formatBytes,
  limitUsage,
  releaseBytes,
  type LimitLevel,
  type StorageSummary,
} from '@/lib/storage';

type Target = 'production' | 'local';

interface Load {
  loading: boolean;
  summary?: StorageSummary;
  error?: string;
  detail?: string;
}

const TARGETS: { id: Target; label: string; detail: string; icon: LucideIcon }[] = [
  {
    id: 'production',
    label: 'Production',
    detail: 'Neon, read through the public Brain',
    icon: Cloud,
  },
  {
    id: 'local',
    label: 'Local dev',
    detail: "The dev Brain's database on this machine",
    icon: Laptop,
  },
];

const LEVEL_STYLES: Record<LimitLevel, { bar: string; text: string; label: string }> = {
  ok: { bar: 'bg-emerald-400', text: 'text-emerald-300', label: 'Plenty of room' },
  warning: { bar: 'bg-amber-400', text: 'text-amber-300', label: 'Neon warns past 80%' },
  critical: { bar: 'bg-rose-400', text: 'text-rose-300', label: 'Nearly full' },
};

const STATUS_STYLES: Record<string, string> = {
  active: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  retired: 'border-white/10 bg-white/5 text-neutral-400',
  failed: 'border-rose-500/30 bg-rose-500/10 text-rose-300',
};

async function fetchSummary(target: Target): Promise<StorageSummary> {
  const response = await fetch(
    target === 'production' ? '/api/brain/storage?target=production' : '/api/brain/storage',
    { cache: 'no-store' }
  );
  const body: unknown = await response.json().catch(() => null);
  if (response.ok) return body as StorageSummary;
  const record = (body ?? {}) as Record<string, unknown>;
  const error = new Error(
    response.status === 404
      ? 'This Brain has no storage route yet.'
      : record.error === 'storage_unavailable'
        ? 'The Brain could not read its database.'
        : typeof record.error === 'string'
          ? record.error
          : `HTTP ${response.status}`
  );
  (error as Error & { detail?: string }).detail =
    response.status === 404
      ? 'Deploy a Brain that serves GET /v1/storage.'
      : typeof record.detail === 'string'
        ? record.detail
        : undefined;
  throw error;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-neutral-900/60 shadow-lg backdrop-blur-md">
      <h3 className="border-b border-white/10 px-5 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

function SizeCard({ target, summary }: { target: Target; summary: StorageSummary }) {
  if (target === 'local') {
    return (
      <Card title="Database size">
        <p className="text-3xl font-bold tracking-tight text-white">
          {formatBytes(summary.database.bytes)}
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          <span className="font-mono">{summary.database.name}</span>. Every database on this
          Postgres server together: {formatBytes(summary.database.allDatabasesBytes)}. No limit
          applies here.
        </p>
      </Card>
    );
  }
  // Neon counts every database in the branch against the plan's limit.
  const used = summary.database.allDatabasesBytes;
  const usage = limitUsage(used);
  const style = LEVEL_STYLES[usage.level];
  const percent = Math.round(usage.share * 1000) / 10;
  return (
    <Card title="Database size against the Neon Free limit">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className={`text-3xl font-bold tracking-tight ${style.text}`}>
          {formatBytes(used)}
        </span>
        <span className="text-sm text-muted-foreground">
          of {formatBytes(NEON_FREE_STORAGE_BYTES)} ({percent}%)
        </span>
      </div>
      <div
        role="progressbar"
        aria-label="Share of the Neon Free storage limit in use"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(100, percent)}
        className="mt-3 h-2.5 overflow-hidden rounded-full bg-white/10"
      >
        <div
          className={`h-full rounded-full ${style.bar}`}
          style={{ width: `${Math.min(100, usage.share * 100)}%` }}
        />
      </div>
      <p className={`mt-2 text-xs ${style.text}`}>
        {style.label}:{' '}
        {usage.remaining >= 0
          ? `${formatBytes(usage.remaining)} left`
          : `${formatBytes(-usage.remaining)} over`}
        .
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        Postgres&apos;s own measure. The Neon console can read a little higher, and its
        number is the one the limit uses.
      </p>
    </Card>
  );
}

function TablesCard({ summary }: { summary: StorageSummary }) {
  const tables = summary.tables.slice(0, 8);
  const largest = Math.max(1, ...tables.map((table) => table.bytes));
  return (
    <Card title="What uses the space">
      <ul className="space-y-3">
        {tables.map((table) => (
          <li key={`${table.schema}.${table.name}`}>
            <div className="flex items-baseline justify-between gap-3 text-xs">
              <span className="truncate font-mono text-neutral-200">
                <span className="text-muted-foreground">{table.schema}.</span>
                {table.name}
              </span>
              <span className="shrink-0 font-medium text-white">{formatBytes(table.bytes)}</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/5">
              <div
                className="h-full rounded-full bg-sky-400/70"
                style={{ width: `${(table.bytes / largest) * 100}%` }}
              />
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {formatBytes(table.indexBytes)} of indexes · about{' '}
              {table.estimatedRows.toLocaleString('en-US')} rows
            </p>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function ReleasesCard({ summary }: { summary: StorageSummary }) {
  return (
    <Card title={`Releases kept (${summary.releases.length})`}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[30rem] text-left text-xs">
          <thead className="text-muted-foreground">
            <tr>
              <th className="pb-2 font-medium">Release</th>
              <th className="pb-2 font-medium">Status</th>
              <th className="pb-2 font-medium">Activated</th>
              <th className="pb-2 text-right font-medium">Passages</th>
              <th className="pb-2 text-right font-medium">Stored</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {summary.releases.map((release) => (
              <tr key={release.version}>
                <td className="max-w-[14rem] truncate py-2 pr-3 font-mono text-neutral-200">
                  {release.version}
                </td>
                <td className="py-2 pr-3">
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[11px] ${
                      STATUS_STYLES[release.status] ??
                      'border-sky-500/30 bg-sky-500/10 text-sky-300'
                    }`}
                  >
                    {release.status}
                  </span>
                </td>
                <td className="py-2 pr-3 text-neutral-300">{formatDate(release.activatedAt)}</td>
                <td className="py-2 pr-3 text-right text-neutral-300">
                  {release.passages.toLocaleString('en-US')}
                </td>
                <td className="py-2 text-right font-medium text-white">
                  {formatBytes(releaseBytes(release))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">
        Stored is each release&apos;s own compressed passages, documents and files. Indexes
        and space freed by deleted releases are shared, so they show only in the table sizes.
      </p>
    </Card>
  );
}

function ArtifactsCard({ summary }: { summary: StorageSummary }) {
  return (
    <Card title="Largest files in the active release">
      <p className="mb-3 truncate font-mono text-xs text-muted-foreground">
        {summary.activeRelease}
      </p>
      <ul className="space-y-1.5 text-xs">
        {summary.activeArtifacts.slice(0, 6).map((artifact) => (
          <li key={artifact.key} className="flex justify-between gap-3">
            <span className="truncate font-mono text-neutral-200">{artifact.key}</span>
            <span className="shrink-0 text-white">{formatBytes(artifact.bytes)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function StorageColumn({
  target,
  load,
}: {
  target: (typeof TARGETS)[number];
  load: Load;
}) {
  const Icon = target.icon;
  const summary = load.summary;
  return (
    <div className="min-w-0 space-y-4">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/5 text-neutral-200">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-white">{target.label}</h2>
          <p className="truncate text-xs text-muted-foreground">
            {target.detail}
            {summary ? ` · measured ${formatDate(summary.measuredAt)}` : ''}
          </p>
        </div>
      </div>
      {load.error ? (
        <div
          role="alert"
          className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-5 text-rose-200"
        >
          <p className="font-semibold">{load.error}</p>
          {load.detail && <p className="mt-2 font-mono text-xs">{load.detail}</p>}
        </div>
      ) : summary ? (
        <>
          <SizeCard target={target.id} summary={summary} />
          <TablesCard summary={summary} />
          <ReleasesCard summary={summary} />
          <ArtifactsCard summary={summary} />
        </>
      ) : (
        <p className="text-xs text-muted-foreground">Measuring…</p>
      )}
    </div>
  );
}

export function StorageDashboard() {
  const [loads, setLoads] = useState<Record<Target, Load>>({
    production: { loading: true },
    local: { loading: true },
  });

  const refresh = useCallback(() => {
    for (const { id } of TARGETS) {
      setLoads((current) => ({ ...current, [id]: { ...current[id], loading: true } }));
      fetchSummary(id).then(
        (summary) => setLoads((current) => ({ ...current, [id]: { loading: false, summary } })),
        (error: unknown) =>
          setLoads((current) => ({
            ...current,
            [id]: {
              loading: false,
              error: error instanceof Error ? error.message : String(error),
              detail: (error as { detail?: string } | null)?.detail,
            },
          }))
      );
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const loading = loads.production.loading || loads.local.loading;
  return (
    <>
      <PageHeader
        title="Storage"
        subtitle="Database size, what uses it, and the releases kept, in production and locally"
        actions={
          <button
            onClick={refresh}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-neutral-900/80 px-3 py-1.5 text-xs font-medium text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-white"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        }
      />
      <main className="min-w-0 px-6 py-6">
        <div className="grid gap-8 xl:grid-cols-2">
          {TARGETS.map((target) => (
            <StorageColumn key={target.id} target={target} load={loads[target.id]} />
          ))}
        </div>
        <p className="mt-6 text-xs text-muted-foreground">
          The Brain measures at most once a minute; a refresh within that minute shows the
          same numbers.
        </p>
      </main>
    </>
  );
}
