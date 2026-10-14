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
  readFacts,
  readHours,
  type FactProperty,
  type FactSource,
  type OfficeFacts,
} from '@/lib/office-facts';

type FactsResult =
  | { key: string; facts: OfficeFacts }
  | { key: string; changed: true }
  | { key: string; error: string };

/** "+12016847300" as people write it; anything else unchanged. */
function formatPhone(text: string): string {
  const us = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(text);
  return us ? `(${us[1]}) ${us[2]}-${us[3]}` : text;
}

function formatScalar(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  return formatPhone(String(value));
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** A published value laid out by its shape: a list one item per line, a record one field per line. */
function ValueView({ value }: { value: unknown }) {
  if (Array.isArray(value)) {
    if (value.every((item) => !isRecord(item) && !Array.isArray(item))) {
      return <span className="font-mono text-foreground">{value.map(formatScalar).join(', ')}</span>;
    }
    return (
      <ul className="space-y-0.5">
        {value.map((item, index) => <li key={index}><ValueView value={item} /></li>)}
      </ul>
    );
  }
  if (isRecord(value)) {
    const entries = Object.entries(value);
    // A labelled contact ({type, number} or {label, location}) reads as "Label: value" on one line.
    const label = value.type ?? value.label;
    const main = value.number ?? value.location;
    if (entries.length <= 2 && (typeof label === 'string' || label === undefined) && typeof main === 'string') {
      return (
        <span className="font-mono text-foreground">
          {typeof label === 'string' && <span className="font-sans text-muted-foreground">{label}: </span>}
          {formatScalar(main)}
        </span>
      );
    }
    return (
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
        {entries.map(([name, item]) => (
          <div key={name} className="contents">
            <dt className="text-muted-foreground">{name.replaceAll('_', ' ')}</dt>
            <dd className="min-w-0 break-words"><ValueView value={item} /></dd>
          </div>
        ))}
      </dl>
    );
  }
  return <span className="break-words font-mono text-foreground">{formatScalar(value)}</span>;
}

interface Trip { departure?: string; arrival?: string; stops?: Array<{ location: string; time: string }> }

/** A route's trips as its published timetable: one row per trip, one column per stop in route order. */
function TripsTable({ value }: { value: unknown }) {
  const trips = (value as { trips?: unknown })?.trips;
  if (!Array.isArray(trips)) return null;
  // A stop some trip visits twice (the train going out and coming back) gets two columns: a trip's
  // first stop is the visit going out, and any later visit is the one coming back.
  const twice = new Set((trips as Trip[]).flatMap((trip) => {
    const names = (trip.stops ?? []).map((stop) => stop.location);
    return names.filter((name, index) => names.indexOf(name) !== index);
  }));
  const rows = (trips as Trip[]).map((trip) => {
    const cells = (trip.stops ?? []).map((stop, index) => ({
      key: twice.has(stop.location) ? `${stop.location}#${index === 0 ? 'out' : 'back'}` : stop.location,
      location: stop.location, time: stop.time,
    }));
    return { trip, cells };
  });
  const columns: Array<{ key: string; location: string }> = [];
  // The trips with the most stops set the order; shorter trips fit between them.
  for (const { cells } of [...rows].sort((a, b) => b.cells.length - a.cells.length)) {
    let at = -1;
    for (const cell of cells) {
      const found = columns.findIndex((column) => column.key === cell.key);
      if (found >= 0) at = found;
      else columns.splice(++at, 0, { key: cell.key, location: cell.location });
    }
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="text-left text-muted-foreground">
          <tr>
            <th className="px-2 py-1 font-medium">Leave campus</th>
            {columns.map((column) => <th key={column.key} className="px-2 py-1 font-medium">{column.location}</th>)}
            <th className="px-2 py-1 font-medium">Back on campus</th>
          </tr>
        </thead>
        <tbody className="font-mono text-foreground">
          {rows.map(({ trip, cells }, index) => (
            <tr key={index} className="border-t border-white/5">
              <td className="whitespace-nowrap px-2 py-1">{trip.departure ?? '–'}</td>
              {columns.map((column) => (
                <td key={column.key} className="whitespace-nowrap px-2 py-1">
                  {cells.find((cell) => cell.key === column.key)?.time ?? <span className="text-muted-foreground">–</span>}
                </td>
              ))}
              <td className="whitespace-nowrap px-2 py-1">{trip.arrival ?? '–'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface MenuItem { name?: string; calories?: number | null; portion?: string | null; vegan?: boolean;
  vegetarian?: boolean; allergens?: string[] }
interface Menu { date?: string; meals?: Array<{ meal?: string; stations?: Array<{ station?: string; items?: MenuItem[] }> }> }

const isMenu = (value: unknown): value is Menu =>
  isRecord(value) && Array.isArray(value.meals) && value.meals.every((meal) => isRecord(meal) && Array.isArray(meal.stations));

/** A date's menu: each meal folds open to its stations, and each item shows calories, portion, diet and allergens. */
function MenuView({ menu }: { menu: Menu }) {
  return (
    <div className="space-y-1 text-xs">
      {menu.date && <p className="text-muted-foreground">Menu for {menu.date}</p>}
      {(menu.meals ?? []).map((meal, index) => (
        <details key={index} className="rounded-lg border border-white/10 px-2 py-1">
          <summary className="cursor-pointer select-none text-foreground">
            {meal.meal} <span className="text-muted-foreground">· {plural(meal.stations?.length ?? 0, 'station', 'stations')}</span>
          </summary>
          <div className="mt-1 space-y-2">
            {(meal.stations ?? []).map((station, stationIndex) => (
              <div key={stationIndex}>
                <p className="font-medium text-muted-foreground">{station.station}</p>
                <ul className="space-y-0.5">
                  {(station.items ?? []).map((item, itemIndex) => (
                    <li key={itemIndex} className="flex flex-wrap gap-x-2">
                      <span className="text-foreground">{item.name}</span>
                      <span className="text-muted-foreground">
                        {[item.calories != null ? `${item.calories} cal` : '', item.portion ?? '',
                          item.vegan ? 'vegan' : item.vegetarian ? 'vegetarian' : '',
                          item.allergens?.length ? `contains ${item.allergens.join(', ')}` : '']
                          .filter(Boolean).join(' · ')}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}

/** One schedule: a row per run of days with the same hours, each meal period on its own line. */
function HoursTable({ value }: { value: unknown }) {
  const hours = readHours(value);
  if (!hours) return null;
  return (
    <div className="space-y-1 text-xs">
      {(hours.schedule || hours.season) && (
        <p className="text-muted-foreground">
          {hours.schedule}{hours.season ? ` · ${hours.season}` : ''}
        </p>
      )}
      <table className="text-foreground">
        <tbody>
          {hours.runs.map((run) => (
            <tr key={run.days} className="border-t border-white/5 align-top">
              <td className="whitespace-nowrap py-1 pr-4 text-muted-foreground">{run.days}</td>
              <td className="py-1 font-mono">
                {run.periods.map((period, index) => (
                  <div key={index} className="flex gap-3">
                    {period.label && <span className="w-24 shrink-0 font-sans text-muted-foreground">{period.label}</span>}
                    <span>{period.time}</span>
                  </div>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {hours.notes.length > 0 && <p className="text-muted-foreground">Published note: {hours.notes.join(' ')}</p>}
      {hours.absences.map((line) => <p key={line} className="text-muted-foreground">{line}</p>)}
    </div>
  );
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
  if (status === 'not_published') return 'info';
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
          <StatusPill tone={counts.known + counts.notPublished === counts.total ? 'ok' : 'idle'}>
            {counts.known} of {plural(counts.total, 'property', 'properties')} known
            {counts.notPublished > 0 && `, ${counts.notPublished} confirmed not published`}
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
  const hasConflict = property.issues?.some((issue) => issue.status === 'conflicting');
  const hasGaps = !!property.issues?.length;
  const status = hasConflict ? 'unresolved conflict'
    : property.status === 'known' && hasGaps ? 'known with gaps' : property.status.replaceAll('_', ' ');
  return (
    <tr className="border-t border-white/5 align-top">
      <td className="px-4 py-2.5">
        <p className="text-foreground">{property.label}</p>
        <p className="font-mono text-[11px] text-muted-foreground">{property.key}</p>
      </td>
      <td className="px-4 py-2.5">
        <StatusPill tone={hasGaps ? 'warn' : statusTone(property.status)}>{status}</StatusPill>
      </td>
      <td className="min-w-0 px-4 py-2.5">
        {property.values.length === 0 && property.absence ? (
          <div className="space-y-1 text-xs text-muted-foreground">
            <p>
              Not published on the office&apos;s own pages. Checked {property.absence.checked_at.slice(0, 10)}
              {property.absence.current ? '.' : ', and that check is not current.'}
            </p>
            {property.absence.scope && <p>Scope: {property.absence.scope.replaceAll('_', ' ')}</p>}
            {property.absence.reason && <p>{property.absence.reason}</p>}
            <ul className="space-y-0.5">
              {property.absence.checks.map((check, index) => (
                <li key={`${index}-${check.url}`} className="break-all">
                  read “{check.section}” on{' '}
                  <a href={check.url} target="_blank" rel="noreferrer" className="font-mono text-sky-300 hover:underline">
                    {check.url}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : property.values.length === 0 ? (
          <p className="text-muted-foreground">No value. Status: {property.status.replaceAll('_', ' ')}.</p>
        ) : (
          <ul className="space-y-1">
            {property.values.map((value, index) => (
              <li key={index} className="flex flex-wrap items-baseline gap-x-3">
                {property.key === 'trips' && Array.isArray((value.value as { trips?: unknown })?.trips) ? (
                  <TripsTable value={value.value} />
                ) : property.key === 'menu' && isMenu(value.value) ? (
                  <MenuView menu={value.value} />
                ) : property.key === 'hours' && readHours(value.value) ? (
                  <HoursTable value={value.value} />
                ) : (
                  <ValueView value={value.value} />
                )}
                <span className="text-[11px] text-muted-foreground">
                  {plural(value.source_ids.length, 'source', 'sources')}
                </span>
              </li>
            ))}
          </ul>
        )}
        {property.values.length > 1 && (
          <p className="mt-1 text-xs text-amber-300">
            {property.status === 'conflicting'
              ? `The Brain reports ${property.values.length} values that conflict.`
              : `The Brain reports ${property.values.length} published values. Check each schedule or validity period.`}
          </p>
        )}
        {property.issues?.map((issue, index) => (
          <div key={`${issue.schedule}-${index}`} className="mt-2 space-y-1 rounded-lg border border-amber-500/30 bg-amber-500/5 p-2 text-xs text-amber-200">
            <p className="font-medium">{issue.schedule}: {issue.status.replaceAll('_', ' ')}</p>
            {issue.season && <p>Season: {issue.season}</p>}
            <p>{issue.reason}</p>
            {issue.days.length > 0 && <p>Unverified days: {issue.days.join(', ')}</p>}
            <p className="text-muted-foreground">{plural(issue.source_ids.length, 'source', 'sources')} listed below</p>
            {issue.source_statements.length > 0 && (
              <ul className="list-disc space-y-1 pl-4">
                {issue.source_statements.map((statement, statementIndex) => <li key={statementIndex}>{statement}</li>)}
              </ul>
            )}
          </div>
        ))}
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
        {source.season && <Line label="season" value={source.season} />}
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
