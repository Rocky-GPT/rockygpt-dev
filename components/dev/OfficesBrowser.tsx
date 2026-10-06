'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, Search } from 'lucide-react';
import { ErrorPanel } from '@/components/ErrorPanel';
import { JsonViewer } from '@/components/JsonViewer';
import { StatusPill, type PillTone } from '@/components/shell/StatusPill';
import { failureMessage } from '@/lib/brain-failure';
import type { DevOffices } from '@/lib/brain-dev-types';
import {
  countFacts,
  formatHours,
  readFacts,
  type FactProperty,
  type FactSource,
  type OfficeFacts,
} from '@/lib/office-facts';

type FactsResult =
  | { key: string; facts: OfficeFacts }
  | { key: string; changed: true }
  | { key: string; error: string };

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) return value.map(formatValue).join(', ');
  if (typeof value === 'object') {
    const entries = Object.entries(value);
    return entries.map(([name, item]) => `${name}: ${formatValue(item)}`).join(', ');
  }
  return String(value);
}

function formatTime(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString(undefined, { timeZoneName: 'short' });
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function statusTone(status: string): PillTone {
  if (status === 'known') return 'ok';
  if (status === 'unknown') return 'idle';
  return 'warn';
}

function freshnessTone(freshness: string): PillTone {
  if (freshness === 'fresh') return 'ok';
  if (freshness === 'stale') return 'warn';
  return 'idle';
}

export function OfficesBrowser({ data }: { data: DevOffices }) {
  const router = useRouter();
  const [reloading, startReload] = useTransition();
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [result, setResult] = useState<FactsResult | null>(null);

  const needle = query.trim().toLowerCase();
  const shown = needle
    ? data.offices.filter(
        (office) =>
          office.name.toLowerCase().includes(needle) ||
          office.aliases.some((alias) => alias.toLowerCase().includes(needle))
      )
    : data.offices;
  const selected =
    data.offices.find((office) => office.entityId === selectedId) ?? data.offices[0] ?? null;
  const entityId = selected?.entityId ?? null;
  const key = entityId ? `${entityId}|${data.datasetVersion}|${data.identityHash}` : null;

  useEffect(() => {
    if (!entityId || !key) return;
    const controller = new AbortController();
    const params = new URLSearchParams({
      dataset_version: data.datasetVersion,
      identity_hash: data.identityHash,
    });
    void (async () => {
      let next: FactsResult;
      try {
        const response = await fetch(
          `/api/brain/offices/${encodeURIComponent(entityId)}/facts?${params}`,
          { cache: 'no-store', signal: controller.signal }
        );
        const body: unknown = await response.json().catch(() => null);
        if (controller.signal.aborted) return;
        if (response.status === 409) next = { key, changed: true };
        else if (!response.ok) next = { key, error: failureMessage(body, response.status) };
        else {
          const facts = readFacts(body);
          next = facts
            ? { key, facts }
            : { key, error: 'The Brain returned an unreadable response.' };
        }
      } catch {
        if (controller.signal.aborted) return;
        next = { key, error: 'The Dev UI could not reach the Brain.' };
      }
      setResult(next);
    })();
    return () => controller.abort();
  }, [entityId, key, data.datasetVersion, data.identityHash]);

  const current = result && result.key === key ? result : null;

  return (
    <div className="grid gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]">
      <aside className="space-y-3">
        <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name or alias"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </label>
        <p className="px-1 text-xs text-muted-foreground">
          {plural(shown.length, 'office', 'offices')}
          {needle && ` of ${data.offices.length}`} in{' '}
          <span className="font-mono text-foreground/80">{data.datasetVersion}</span>
        </p>
        {data.truncated && (
          <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
            The Brain truncated this list. Some published offices are not shown.
          </p>
        )}
        <ul className="max-h-[70vh] space-y-1 overflow-auto">
          {shown.map((office) => (
            <li key={office.entityId}>
              <button
                type="button"
                onClick={() => setSelectedId(office.entityId)}
                aria-current={office.entityId === entityId}
                className={`flex w-full items-baseline justify-between gap-3 rounded-xl border px-3 py-2 text-left text-sm transition-colors ${
                  office.entityId === entityId
                    ? 'border-sky-400/40 bg-sky-400/10 text-foreground'
                    : 'border-transparent text-muted-foreground hover:bg-white/5 hover:text-foreground'
                }`}
              >
                <span className="min-w-0">{office.name}</span>
                {office.aliases.length > 0 && (
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {plural(office.aliases.length, 'alias', 'aliases')}
                  </span>
                )}
              </button>
            </li>
          ))}
          {shown.length === 0 && (
            <li className="px-3 py-2 text-sm text-muted-foreground">No office matches.</li>
          )}
        </ul>
      </aside>

      <section className="min-w-0 space-y-4">
        {!selected && (
          <p className="rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-muted-foreground">
            The Brain published no offices.
          </p>
        )}
        {selected && !current && (
          <p className="rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-muted-foreground">
            Loading the facts for {selected.name}…
          </p>
        )}
        {selected && current && 'error' in current && (
          <ErrorPanel title={`Could not read the facts for ${selected.name}`} detail={current.error} />
        )}
        {selected && current && 'changed' in current && (
          <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-5 text-amber-100">
            <h2 className="font-semibold">The published data changed</h2>
            <p className="mt-2 text-sm">
              This list was loaded from {data.datasetVersion}. The Brain now publishes different data,
              so these facts can no longer be read against it.
            </p>
            <button
              type="button"
              disabled={reloading}
              onClick={() => startReload(() => router.refresh())}
              className="mt-3 flex items-center gap-1.5 rounded-lg border border-amber-400/40 px-2.5 py-1.5 text-xs transition-colors hover:bg-amber-400/10 disabled:opacity-60"
            >
              <RefreshCw className={`h-3 w-3 ${reloading ? 'animate-spin' : ''}`} />
              {reloading ? 'Reloading…' : 'Reload the list'}
            </button>
          </div>
        )}
        {selected && current && 'facts' in current && (
          <FactsView
            facts={current.facts}
            aliases={selected.aliases}
            entityId={selected.entityId}
          />
        )}
      </section>
    </div>
  );
}

export function FactsView({
  facts,
  aliases,
  entityId,
}: {
  facts: OfficeFacts;
  aliases: string[];
  entityId: string;
}) {
  const counts = countFacts(facts);
  const categories = new Map<string, FactProperty[]>();
  for (const property of facts.properties) {
    categories.set(property.category, [...(categories.get(property.category) ?? []), property]);
  }

  return (
    <>
      <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold text-foreground">{facts.entity.name}</h2>
          <span title="The Brain's complete flag. It means no linked evidence record is missing. It says nothing about unknown properties or how fresh the sources are.">
            <StatusPill tone={facts.complete ? 'idle' : 'warn'}>
              {facts.complete ? 'All linked evidence present' : 'Linked evidence missing'}
            </StatusPill>
          </span>
          <StatusPill tone={counts.known === counts.total ? 'ok' : 'idle'}>
            {counts.known} of {plural(counts.total, 'property', 'properties')} known
            {counts.several > 0 && `, ${counts.several} with several values`}
          </StatusPill>
          {counts.stale > 0 && (
            <StatusPill tone="warn">
              {counts.stale} of {plural(counts.sources, 'source', 'sources')} stale
            </StatusPill>
          )}
          {counts.freshnessUnknown > 0 && (
            <StatusPill tone="idle">{counts.freshnessUnknown} with unknown freshness</StatusPill>
          )}
          <span title="The Brain's evidence_count. The sources list can be longer, because it also lists sources derived from the same records.">
            <StatusPill tone="idle">{plural(facts.evidence_count, 'evidence row', 'evidence rows')}</StatusPill>
          </span>
        </div>
        <p className="mt-2 break-all font-mono text-[11px] text-muted-foreground">{entityId}</p>
        {aliases.length > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            Also called: <span className="text-foreground/80">{aliases.join(', ')}</span>
          </p>
        )}
      </div>

      {facts.caveats.length > 0 && (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-100">
          <h3 className="font-semibold">Caveats</h3>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {facts.caveats.map((caveat) => (
              <li key={caveat}>{caveat}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-white/10 text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-semibold">Property</th>
              <th className="px-4 py-2 font-semibold">Status</th>
              <th className="px-4 py-2 font-semibold">Values</th>
            </tr>
          </thead>
          {[...categories].map(([category, properties]) => (
            <tbody key={category} className="border-t border-white/10 first:border-t-0">
              <tr>
                <th
                  colSpan={3}
                  className="bg-white/[0.03] px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  {category}
                </th>
              </tr>
              {properties.map((property) => (
                <PropertyRow key={property.key} property={property} />
              ))}
            </tbody>
          ))}
        </table>
      </div>

      <div className="space-y-3">
        <h3 className="px-1 text-sm font-semibold text-foreground">
          Sources ({facts.sources.length})
        </h3>
        {facts.sources.map((source) => (
          <SourceCard key={source.id} source={source} />
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10">
        <JsonViewer data={facts} title="Raw JSON" />
      </div>
    </>
  );
}

function PropertyRow({ property }: { property: FactProperty }) {
  return (
    <tr className="border-t border-white/5 align-top">
      <td className="px-4 py-2.5">
        <p className="text-foreground">{property.label}</p>
        <p className="font-mono text-[11px] text-muted-foreground">{property.key}</p>
      </td>
      <td className="px-4 py-2.5">
        <StatusPill tone={statusTone(property.status)}>{property.status}</StatusPill>
      </td>
      <td className="min-w-0 px-4 py-2.5">
        {property.values.length === 0 ? (
          <p className="text-muted-foreground">No value. Status: {property.status}.</p>
        ) : (
          <ul className="space-y-1">
            {property.values.map((value, index) => (
              <li key={index} className="flex flex-wrap items-baseline gap-x-3">
                <span className="break-all font-mono text-foreground">
                  {(property.key === 'hours' ? formatHours(value.value) : null) ?? formatValue(value.value)}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {plural(value.source_ids.length, 'source', 'sources')}
                </span>
              </li>
            ))}
          </ul>
        )}
        {property.values.length > 1 && (
          <p className="mt-1 text-xs text-amber-300">
            {property.status === 'multiple'
              ? `The Brain reports ${property.values.length} values from sources with different validity dates.`
              : `The Brain reports ${property.values.length} values that conflict.`}
          </p>
        )}
        <details className="mt-1.5">
          <summary className="cursor-pointer select-none text-xs text-muted-foreground hover:text-foreground">
            {plural(property.assertions.length, 'assertion', 'assertions')}
            {property.values.length === 0 && ' (no value)'}
          </summary>
          <ul className="mt-2 space-y-2">
            {property.assertions.map((assertion) => (
              <li
                key={assertion.id}
                className="space-y-0.5 rounded-lg border border-white/10 bg-black/20 p-2 text-xs"
              >
                <Line label="field" value={assertion.field} />
                <Line label="as published" value={JSON.stringify(assertion.raw_value)} />
                <Line label="as read" value={JSON.stringify(assertion.value)} />
                <Line label="source" value={assertion.source_id} />
                {assertion.caveats.map((caveat) => (
                  <p key={caveat} className="text-amber-300">
                    {caveat}
                  </p>
                ))}
              </li>
            ))}
          </ul>
        </details>
      </td>
    </tr>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <span className="w-24 shrink-0 text-muted-foreground/70">{label}</span>
      <span className="min-w-0 break-all font-mono text-foreground/80">{value}</span>
    </div>
  );
}

function SourceCard({ source }: { source: FactSource }) {
  const urls = [source.url, ...source.citation_urls].filter(
    (url, index, all): url is string => url !== null && all.indexOf(url) === index
  );
  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-4 text-xs text-muted-foreground">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-foreground">
          {source.collection} / {source.source_key} / {source.source_record_key}
        </span>
        <StatusPill tone={freshnessTone(source.freshness)}>{source.freshness}</StatusPill>
        <StatusPill tone="idle">validity: {source.validity}</StatusPill>
      </div>
      <div className="mt-3 space-y-1.5">
        {urls.map((url) => (
          <div key={url} className="break-all">
            {/^https?:\/\//.test(url) ? (
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-sky-300 hover:underline"
              >
                {url}
              </a>
            ) : (
              <span className="font-mono">{url}</span>
            )}
          </div>
        ))}
        <Line label="collected" value={formatTime(source.collected_at)} />
        <Line
          label="freshness SLA"
          value={source.freshness_sla_hours === null ? '—' : `${source.freshness_sla_hours} hours`}
        />
        {(source.valid_from || source.valid_until) && (
          <Line
            label="valid"
            value={`${formatTime(source.valid_from)} to ${formatTime(source.valid_until)}`}
          />
        )}
        {source.caveats?.map((caveat) => (
          <p key={caveat} className="text-amber-300">
            {caveat}
          </p>
        ))}
        <p className="break-all font-mono text-[11px] text-muted-foreground/70">{source.id}</p>
      </div>
    </section>
  );
}
