'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ExternalLink, RefreshCw, Search } from 'lucide-react';
import { KIND_LABELS, safeSourceUrl, type IdentityKind } from '@/lib/identities';
import {
  BASES,
  KIND_NAMES,
  LOOKUP_LABELS,
  basisCounts,
  basisLabel,
  evidenceText,
  filterAliasRows,
  groupSources,
  onlyEvents,
  parseAliasTable,
  type AliasBasis,
  type AliasFilter,
  type AliasLookup,
  type AliasMatch,
  type AliasRow,
  type AliasSource,
  type AliasTable as AliasTableData,
} from '@/lib/identity-aliases';

const PAGE_SIZE = 100;
const button = 'rounded-lg border border-white/15 px-3 py-2 text-xs hover:bg-white/5 disabled:opacity-30';
const LOOKUP_TONES: Record<AliasLookup, string> = {
  single: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  ambiguous: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  event_dates: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
};

/** Every alias in the campus identity map, what a lookup by it finds, and why it exists. */
export function AliasTable() {
  const [table, setTable] = useState<AliasTableData>();
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setTable(undefined); setError('');
    fetch('/api/brain/identities/aliases', { signal: controller.signal, cache: 'no-store' })
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? body.detail ?? 'Could not load aliases.');
        return parseAliasTable(body);
      })
      .then(result => { if (!controller.signal.aborted) setTable(result); })
      .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Could not load aliases.'); });
    return () => controller.abort();
  }, [reload]);
  if (error) return <div role="alert" className="space-y-4 rounded-xl border border-amber-400/30 p-6"><p>{error}</p><button className={button} onClick={() => setReload(value => value + 1)}>Retry loading aliases</button></div>;
  if (!table) return <p role="status" className="p-8 text-sm text-muted-foreground">Loading aliases…</p>;
  return <AliasView key={`${table.dataset_version}:${table.identity_hash}`} table={table} reload={() => setReload(value => value + 1)} />;
}

function AliasView({ table, reload }: { table: AliasTableData; reload: () => void }) {
  const [filter, setFilter] = useState<AliasFilter>({ query: '', basis: 'all', kind: 'all', lookup: 'all', events: false });
  const [limit, setLimit] = useState(PAGE_SIZE);
  const counts = useMemo(() => basisCounts(table.aliases), [table]);
  const kinds = useMemo(() => [...new Set(table.aliases.flatMap(row => row.matches.map(match => match.kind)))].sort(), [table]);
  const rows = useMemo(() => filterAliasRows(table.aliases, filter), [table, filter]);
  const asking = table.aliases.filter(row => row.lookup !== 'single').length;
  const eventNames = table.aliases.filter(onlyEvents).length;
  function update(change: Partial<AliasFilter>) { setFilter(previous => ({ ...previous, ...change })); setLimit(PAGE_SIZE); }
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
      <span><strong className="text-foreground">{table.alias_count}</strong> aliases</span>
      <span><strong className="text-foreground">{table.aliases.length}</strong> distinct names</span>
      <span><strong className="text-foreground">{asking}</strong> find more than one entity</span>
      <span className="font-mono">{table.dataset_version}</span>
      <button className={`${button} ml-auto inline-flex items-center gap-1.5`} onClick={reload}><RefreshCw className="h-3.5 w-3.5" aria-hidden />Reload</button>
    </div>
    <p className="text-xs text-muted-foreground">A lookup matches the whole name, ignoring case and spacing, against every entity&apos;s name and aliases. When several entities answer to a name, the assistant asks which one is meant.</p>
    {!table.sources_published && <p role="note" className="rounded-xl border border-amber-400/30 bg-amber-500/5 p-3 text-xs text-amber-200">This release does not record why each alias exists. Rebuild it with the current data compiler to see each alias&apos;s rule and evidence.</p>}
    <div className="space-y-3 rounded-2xl border border-white/10 bg-neutral-900/60 p-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-60 flex-1 flex-col gap-1 text-xs text-muted-foreground">
          Search
          <span className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5" aria-hidden />
            <input type="search" value={filter.query} onChange={event => update({ query: event.target.value })} placeholder="Alias or entity name, e.g. Birch" className="w-full rounded-lg border border-white/15 bg-transparent py-2 pl-8 pr-3 text-sm text-foreground" />
          </span>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Entity kind
          <select value={filter.kind} onChange={event => update({ kind: event.target.value as IdentityKind | 'all' })} className="rounded-lg border border-white/15 bg-neutral-950 px-3 py-2 text-sm text-foreground">
            <option value="all">All kinds</option>
            {kinds.map(kind => <option key={kind} value={kind}>{KIND_LABELS[kind] ?? kind}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Lookup
          <select value={filter.lookup} onChange={event => update({ lookup: event.target.value as AliasLookup | 'all' })} className="rounded-lg border border-white/15 bg-neutral-950 px-3 py-2 text-sm text-foreground">
            <option value="all">Any result</option>
            {(Object.keys(LOOKUP_LABELS) as AliasLookup[]).map(lookup => <option key={lookup} value={lookup}>{LOOKUP_LABELS[lookup]}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={filter.events} onChange={event => update({ events: event.target.checked })} />
          Include event titles ({eventNames} names)
        </label>
      </div>
      <div role="group" aria-label="Why the alias exists" className="flex flex-wrap gap-2">
        <Chip active={filter.basis === 'all'} onClick={() => update({ basis: 'all' })} label="Any reason" count={table.alias_count} />
        {BASES.filter(item => counts.has(item.basis)).map(item => <Chip key={item.basis} active={filter.basis === item.basis} onClick={() => update({ basis: item.basis })} label={item.label} count={counts.get(item.basis) ?? 0} title={item.description} />)}
      </div>
    </div>
    <div className="overflow-x-auto rounded-2xl border border-white/10 bg-neutral-900/60">
      <table className="w-full text-left text-xs">
        <caption className="sr-only">Aliases, the entities a lookup by each one finds, and why</caption>
        <thead className="border-b border-white/10 bg-neutral-950/50 text-[11px] uppercase tracking-wider text-neutral-400">
          <tr>
            <th scope="col" className="px-4 py-3 font-medium">Name people use</th>
            <th scope="col" className="px-4 py-3 font-medium">Finds, and why</th>
            <th scope="col" className="px-4 py-3 font-medium">Lookup</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5 text-neutral-300">
          {rows.slice(0, limit).map(row => <AliasTableRow key={row.alias} row={row} />)}
          {!rows.length && <tr><td colSpan={3} className="px-4 py-8 text-center text-neutral-500">No alias matches these filters.</td></tr>}
        </tbody>
      </table>
    </div>
    <div className="flex items-center justify-between text-xs text-muted-foreground">
      <span>Showing {Math.min(limit, rows.length)} of {rows.length} names</span>
      {rows.length > limit && <button className={button} onClick={() => setLimit(value => value + PAGE_SIZE)}>Show {Math.min(PAGE_SIZE, rows.length - limit)} more</button>}
    </div>
  </div>;
}

function Chip({ active, onClick, label, count, title }: { active: boolean; onClick: () => void; label: string; count: number; title?: string }) {
  return <button type="button" aria-pressed={active} title={title} onClick={onClick}
    className={`rounded-full border px-3 py-1 text-xs ${active ? 'border-sky-400/60 bg-sky-500/15 text-sky-200' : 'border-white/15 text-neutral-300 hover:bg-white/5'}`}>
    {label} <span className="text-neutral-500">{count}</span>
  </button>;
}

function AliasTableRow({ row }: { row: AliasRow }) {
  return <tr className="align-top hover:bg-white/[0.02]">
    <th scope="row" className="px-4 py-3 text-sm font-medium text-white">{row.alias}</th>
    <td className="px-4 py-3"><ul className="space-y-3">{row.matches.map(match => <MatchItem key={match.id} match={match} />)}</ul></td>
    <td className="px-4 py-3">
      <span className={`inline-flex whitespace-nowrap rounded-md border px-2 py-0.5 text-[11px] font-medium ${LOOKUP_TONES[row.lookup]}`}>
        {LOOKUP_LABELS[row.lookup]}{row.matches.length > 1 && ` (${row.matches.length})`}
      </span>
    </td>
  </tr>;
}

function MatchItem({ match }: { match: AliasMatch }) {
  return <li className="space-y-1">
    <div className="flex items-baseline gap-2">
      <span aria-hidden className="text-neutral-500">→</span>
      <span className="flex min-w-0 flex-wrap items-center gap-2">
        <Link href={`/data/entities?entity=${encodeURIComponent(match.id)}`} className="font-medium text-sky-300 hover:underline">{match.name}</Link>
        <span className="rounded border border-white/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-neutral-400">{KIND_NAMES[match.kind] ?? match.kind}</span>
        {match.status && <span className="rounded border border-amber-500/30 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-amber-300">{match.status}</span>}
      </span>
    </div>
    <ul className="space-y-1 pl-5 text-neutral-400">
      {match.by_name && <li>{match.aliases.length ? 'Same as its own name apart from spacing or case, so it adds nothing to lookup' : 'Its own name'}</li>}
      {match.aliases.map(alias => alias.sources.length
        ? groupSources(alias.sources).map(group => <Reason key={`${alias.alias}:${group.basis}`} basis={group.basis} sources={group.sources} />)
        : <li key={alias.alias}>Alias &ldquo;{alias.alias}&rdquo;; no reason recorded in this release</li>)}
    </ul>
  </li>;
}

function Reason({ basis, sources }: { basis: AliasBasis; sources: AliasSource[] }) {
  const [first] = sources;
  const url = first.source_url ? safeSourceUrl(first.source_url) : undefined;
  return <li className="space-y-0.5">
    <span className={`mr-2 inline-flex rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${basis === 'human_reviewed' ? 'border-violet-400/40 bg-violet-500/10 text-violet-200' : 'border-white/10 text-neutral-300'}`} title={BASES.find(item => item.basis === basis)?.description}>{basisLabel(basis)}</span>
    {first.reviewed_at && <span>Reviewed {first.reviewed_at}. </span>}
    {first.note && <span>{first.note} </span>}
    {first.evidence && <span className="font-mono text-[11px] text-neutral-500">{evidenceText(first.evidence)}</span>}
    {url && <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sky-400 hover:underline">{url}<ExternalLink className="h-3 w-3" aria-hidden /></a>}
    {sources.length > 1 && <details className="mt-1">
      <summary className="cursor-pointer text-neutral-500">{sources.length - 1} more {sources.length === 2 ? 'record' : 'records'}</summary>
      <ul className="mt-1 space-y-0.5 pl-3 font-mono text-[11px] text-neutral-500">
        {sources.slice(1).map((source, index) => <li key={index}>{source.evidence ? evidenceText(source.evidence) : source.note ?? source.source_url}</li>)}
      </ul>
    </details>}
  </li>;
}
