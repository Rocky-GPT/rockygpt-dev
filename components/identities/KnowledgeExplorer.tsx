'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, ChevronRight, Download, Home, RefreshCw, Search } from 'lucide-react';
import { safeSourceUrl } from '@/lib/identities';
import { CAMPUS, connections, kindLabel, traverse, type CampusEntity, type EntityProperties, type KnowledgeIndex, type PropertyGroup, type TraversalStep } from '@/lib/knowledge-graph';

async function read<T>(operation: string, params: URLSearchParams, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/brain/graph/${operation}?${params}`, { signal, cache: 'no-store' });
  const body = await response.json();
  if (!response.ok) throw new Error(response.status === 409 ? 'The campus release changed. Reload the graph to continue.' : body.error ?? body.detail ?? 'Could not load campus knowledge.');
  return body;
}
const button = 'rounded-lg border border-white/15 px-3 py-2 text-xs hover:bg-white/5 disabled:opacity-30';
const PAGE_SIZE = 8;

export function KnowledgeExplorer() {
  const [graph, setGraph] = useState<KnowledgeIndex>();
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setGraph(undefined); setError('');
    read<KnowledgeIndex>('knowledge', new URLSearchParams(), controller.signal).then(result => { if (!controller.signal.aborted) setGraph(result); })
      .catch(reason => { if (!controller.signal.aborted) setError(reason.message); });
    return () => controller.abort();
  }, [reload]);
  if (error) return <div role="alert" className="space-y-4 rounded-xl border border-amber-400/30 p-6"><p>{error}</p><button className={button} onClick={() => setReload(value => value + 1)}>Retry loading graph</button></div>;
  if (!graph) return <p role="status" className="p-8 text-sm text-muted-foreground">Loading campus knowledge…</p>;
  return <Explorer key={`${graph.dataset_version}:${graph.identity_hash}`} graph={graph} reload={() => setReload(value => value + 1)} />;
}

function Explorer({ graph, reload }: { graph: KnowledgeIndex; reload: () => void }) {
  const [path, setPath] = useState<TraversalStep[]>(() => {
    const id = typeof window === 'undefined' ? null : new URL(window.location.href).searchParams.get('entity');
    const node = graph.nodes.find(item => item.id === id);
    return node ? [CAMPUS, { type: 'category', kind: node.kind, label: kindLabel(node.kind), query: '' }, { type: 'entity', id: node.id, label: node.name }] : [CAMPUS];
  });
  const [search, setSearch] = useState('');
  const [searchLimit, setSearchLimit] = useState(PAGE_SIZE);
  const [relationFilter, setRelationFilter] = useState('');
  const [relationPage, setRelationPage] = useState(0);
  const current = path.at(-1)!;
  const entity = current.type === 'entity' ? graph.nodes.find(node => node.id === current.id) : undefined;
  const categories = useMemo(() => [...new Set(graph.nodes.map(node => node.kind))].map(kind => ({ kind, label: kindLabel(kind), count: graph.nodes.filter(node => node.kind === kind).length })), [graph]);
  const adjacent = useMemo(() => entity ? connections(graph, entity.id) : [], [graph, entity]);
  const filteredRelations = adjacent.filter(item => !relationFilter || item.edge.type === relationFilter);
  const visibleRelations = filteredRelations.slice(relationPage * PAGE_SIZE, (relationPage + 1) * PAGE_SIZE);
  const categoryNodes = current.type === 'category' ? graph.nodes.filter(node => node.kind === current.kind && matches(node, current.query)) : [];
  const searchResults = search.trim() ? graph.nodes.filter(node => matches(node, search)) : [];
  function navigate(next: TraversalStep[]) {
    setPath(next); setSearch(''); setRelationFilter(''); setRelationPage(0);
    const last = next.at(-1)!;
    const url = new URL(window.location.href);
    if (last.type === 'entity') url.searchParams.set('entity', last.id); else url.searchParams.delete('entity');
    window.history.replaceState(null, '', url);
  }
  function open(node: CampusEntity, via?: string) { navigate(traverse(path, node, via)); }
  function category(kind: string) { navigate([...path, { type: 'category', kind, label: kindLabel(kind), query: '' }]); }
  function updateCategory(change: { query: string }) {
    setPath(previous => previous.map((step, index) => index === previous.length - 1 && step.type === 'category' ? { ...step, ...change } : step));
  }
  function download() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(graph, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'campus-knowledge-graph.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
      <p>{graph.nodes.length.toLocaleString()} entities · {graph.edges.length.toLocaleString()} published relationships · {graph.dataset_version}</p>
      <div className="flex gap-2"><button onClick={download} className={`${button} flex items-center gap-2`}><Download size={14} />Download graph</button><button onClick={reload} className={`${button} flex items-center gap-2`}><RefreshCw size={14} />Reload graph</button></div>
    </div>
    <section aria-label="Campus knowledge graph" className="overflow-hidden rounded-2xl border border-sky-400/20 bg-[#101820]">
      <header className="space-y-4 border-b border-white/10 p-5">
        <div className="flex items-start gap-3">
          <nav aria-label="Graph traversal" className="min-w-0 flex-1"><ol className="flex flex-wrap items-center gap-2 text-xs">
            {path.map((step, index) => <li key={index} className="flex min-w-0 items-center gap-2">
              {index > 0 && <span className="flex items-center gap-2 text-slate-400"><ChevronRight size={12} />{step.type === 'entity' && step.via && <span className="text-[10px]">{step.via}</span>}</span>}
              <button className="flex min-w-0 items-center gap-2 rounded px-1 py-1 text-sky-200 hover:bg-white/5" title={step.label} aria-current={index === path.length - 1 ? 'location' : undefined} aria-label={index === 0 ? 'Ramapo College home' : undefined} onClick={() => navigate(path.slice(0, index + 1))}>{index === 0 && <Home size={15} />}<span className="max-w-64 truncate">{step.label}</span></button>
            </li>)}
          </ol></nav>
          {path.length > 1 && <button className={`${button} flex shrink-0 items-center gap-1`} onClick={() => navigate(path.slice(0, -1))}><ArrowLeft size={13} />Back</button>}
        </div>
        <label className="flex items-center gap-2 rounded-lg border border-white/15 bg-black/20 px-3"><Search size={15} /><input aria-label="Search campus entities" placeholder="Search people, courses, clubs, places…" value={search} onChange={event => { setSearch(event.target.value); setSearchLimit(PAGE_SIZE); }} className="min-w-0 flex-1 bg-transparent py-3 text-xs outline-none" /></label>
        {search.trim() && <div aria-label="Entity search results" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{searchResults.slice(0, searchLimit).map(node => <EntityButton key={node.id} node={node} onClick={() => open(node, 'search')} />)}<p className="col-span-full text-xs text-muted-foreground">{searchResults.length} matching entities</p>{searchResults.length > searchLimit && <button className={button} onClick={() => setSearchLimit(value => value + PAGE_SIZE)}>Show more results</button>}</div>}
      </header>
      <div className="space-y-6 p-5">
        {current.type === 'campus' && <><div><h2 className="text-lg font-semibold">Explore Ramapo College</h2><p className="mt-2 text-sm text-muted-foreground">Choose a starting point, then follow the connections.</p></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{categories.map(item => <button key={item.kind} onClick={() => category(item.kind)} className="rounded-xl border border-sky-400/20 bg-sky-950/20 p-5 text-left hover:border-sky-300"><span className="block font-medium text-sky-100">{item.label}</span><span className="mt-2 block text-xs text-muted-foreground">{item.count.toLocaleString()} entities <ArrowRight className="ml-2 inline" size={13} /></span></button>)}</div></>}
        {current.type === 'category' && <><h2 className="text-lg font-semibold">{current.label}</h2><input aria-label={`Filter ${current.label}`} value={current.query} onChange={event => updateCategory({ query: event.target.value })} placeholder={`Find in ${current.label.toLowerCase()}…`} className="w-full rounded-lg border border-white/15 bg-black/20 p-3 text-sm" /><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{categoryNodes.map(node => <EntityButton key={node.id} node={node} onClick={() => open(node)} />)}</div><p className="text-xs text-muted-foreground">{categoryNodes.length.toLocaleString()} {current.query.trim() ? 'matching entities' : 'entities'}</p></>}
        {entity && <>
          <div><p className="text-xs uppercase tracking-wider text-teal-300">{entity.kind.replaceAll('_', ' ')}</p><h2 className="mt-2 text-xl font-semibold">{entity.name}</h2>{entity.aliases.length > 0 && <p className="mt-2 text-xs text-muted-foreground">Also known as: {entity.aliases.join(' · ')}</p>}</div>
          <section aria-label="Entity relationships" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-sm font-semibold">Connections <span className="text-muted-foreground">({adjacent.length})</span></h3>{adjacent.length > 0 && <select aria-label="Filter relationships" value={relationFilter} onChange={event => { setRelationFilter(event.target.value); setRelationPage(0); }} className="rounded-lg border border-white/15 bg-neutral-900 p-2 text-xs"><option value="">All relationships</option>{[...new Set(adjacent.map(item => item.edge.type))].map(type => <option key={type} value={type}>{type.replaceAll('_', ' ')}</option>)}</select>}</div>
            {visibleRelations.length > 0 && <ConnectionMap entity={entity} items={visibleRelations} onOpen={open} />}
            {visibleRelations.length > 0 ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{visibleRelations.map(item => <article key={item.key} className="rounded-xl border border-teal-400/25 bg-teal-950/10 p-4"><button onClick={() => open(item.target, item.label)} className="w-full text-left"><span className="flex items-center gap-2 text-xs text-teal-300">{item.label}<ArrowRight size={13} /></span><span className="mt-3 block text-sm font-medium text-white">{item.target.name}</span><span className="mt-1 block text-xs text-muted-foreground">{item.target.kind.replaceAll('_', ' ')}</span></button><details className="mt-3 border-t border-white/10 pt-3 text-[11px] text-muted-foreground"><summary className="cursor-pointer">Relationship evidence</summary>{item.edge.evidence.map((ref, index) => <p key={index} className="mt-2 break-words">{ref.source_key} · {ref.source_record_key} · {ref.field}{ref.source_url && <SourceLink url={ref.source_url} />}</p>)}</details></article>)}</div> : <p className="text-sm text-muted-foreground">No published relationships in this scope. Properties may contain names that have not yet been linked to an entity.</p>}
            {filteredRelations.length > PAGE_SIZE && <Pagination page={relationPage} total={filteredRelations.length} onPage={setRelationPage} />}
          </section>
          <Properties key={`${graph.dataset_version}:${entity.id}`} graph={graph} entity={entity} />
        </>}
      </div>
    </section>
    {graph.diagnostics.length > 0 && <details className="rounded-xl border border-amber-400/20 p-4 text-xs"><summary className="cursor-pointer text-amber-200">{graph.diagnostics.length} data coverage issues</summary><p className="mt-3 text-muted-foreground">Unresolved references remain unlinked. Categories are entry points, not factual relationships.</p><ul className="mt-3 max-h-64 space-y-2 overflow-auto">{graph.diagnostics.map((issue, index) => <li key={index}>{[issue.entity, issue.record, issue.reason].filter(Boolean).map(String).join(' · ')}</li>)}</ul></details>}
  </div>;
}

function ConnectionMap({ entity, items, onOpen }: { entity: CampusEntity; items: ReturnType<typeof connections>; onOpen: (node: CampusEntity, via: string) => void }) {
  const marker = useId().replaceAll(':', '');
  const words = (text: string) => text.length > 28 ? `${text.slice(0, 26)}…` : text;
  return <div className="hidden overflow-hidden rounded-xl border border-white/10 bg-black/10 lg:block">
    <svg viewBox="0 0 1120 680" className="max-h-[65vh] min-h-[400px] w-full" role="group" aria-label="Connected campus entities">
      <defs><marker id={marker} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#2dd4bf" /></marker></defs>
      {items.map((item, index) => {
        const angle = -Math.PI / 2 + index * Math.PI * 2 / Math.max(items.length, 3);
        const x = 560 + Math.cos(angle) * 390; const y = 340 + Math.sin(angle) * 260;
        const centerX = 560 + Math.cos(angle) * 115; const centerY = 340 + Math.sin(angle) * 50;
        const endX = x - Math.cos(angle) * 110; const endY = y - Math.sin(angle) * 45;
        return <g key={item.key}>
          <line x1={item.incoming ? endX : centerX} y1={item.incoming ? endY : centerY} x2={item.incoming ? centerX : endX} y2={item.incoming ? centerY : endY} stroke="#2dd4bf" strokeOpacity="0.65" markerEnd={`url(#${marker})`} />
          <g role="button" tabIndex={0} aria-label={`${item.label}: ${item.target.name}`} onClick={() => onOpen(item.target, item.label)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen(item.target, item.label); } }} className="cursor-pointer">
            <title>{item.label}: {item.target.name}</title><rect x={x - 110} y={y - 45} width="220" height="90" rx="14" fill="#102f30" stroke="#2dd4bf" />
            <text x={x} y={y - 18} textAnchor="middle" fill="#5eead4" fontSize="11">{words(item.label)}</text>
            <text x={x} y={y + 4} textAnchor="middle" fill="#f0fdfa" fontSize="12">{words(item.target.name)}</text>
            <text x={x} y={y + 25} textAnchor="middle" fill="#94a3b8" fontSize="11">{item.target.kind.replaceAll('_', ' ')}</text>
          </g>
        </g>;
      })}
      <g><title>{entity.name}</title><rect x="440" y="294" width="240" height="92" rx="16" fill="#0a3048" stroke="#7dd3fc" /><text x="560" y="338" textAnchor="middle" fill="#e0f2fe" fontSize="13">{words(entity.name)}</text><text x="560" y="361" textAnchor="middle" fill="#94a3b8" fontSize="11">{entity.kind.replaceAll('_', ' ')}</text></g>
    </svg>
  </div>;
}

function matches(node: CampusEntity, query: string) { const q = query.trim().toLowerCase(); return [node.name, node.id, ...node.aliases].some(value => value.toLowerCase().includes(q)); }
function EntityButton({ node, onClick }: { node: CampusEntity; onClick: () => void }) { return <button onClick={onClick} className="flex items-center justify-between gap-3 rounded-xl border border-white/15 p-4 text-left hover:border-sky-300/70 hover:bg-sky-400/5"><span><span className="block text-sm text-sky-100">{node.name}</span><span className="mt-1 block text-xs text-muted-foreground">{node.kind.replaceAll('_', ' ')}</span></span><ArrowRight size={14} className="shrink-0 text-sky-300" /></button>; }
function Pagination({ page, total, onPage }: { page: number; total: number; onPage: (page: number) => void }) { return <div className="flex items-center gap-3 text-xs text-muted-foreground"><span>{total ? page * PAGE_SIZE + 1 : 0}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}</span><button aria-label="Previous entities" className={button} disabled={page === 0} onClick={() => onPage(page - 1)}>Previous</button><button aria-label="Next entities" className={button} disabled={(page + 1) * PAGE_SIZE >= total} onClick={() => onPage(page + 1)}>Next</button></div>; }
function SourceLink({ url }: { url: string }) { const safe = safeSourceUrl(url); return safe ? <a href={safe} target="_blank" rel="noopener noreferrer" className="ml-2 text-sky-300 underline">Source</a> : null; }

function Properties({ graph, entity }: { graph: KnowledgeIndex; entity: CampusEntity }) {
  const [groups, setGroups] = useState<PropertyGroup[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState('');
  const [diagnostics, setDiagnostics] = useState<Record<string, unknown>[]>([]);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError('');
    read<EntityProperties>('properties', new URLSearchParams({ entity_id: entity.id, dataset_version: graph.dataset_version }), controller.signal).then(result => {
      if (controller.signal.aborted) return;
      if (result.identity_hash !== graph.identity_hash) throw new Error('Identity links changed. Reload the graph.');
      setGroups(result.groups); setDiagnostics(result.diagnostics);
    }).catch(reason => { if (!controller.signal.aborted) setError(reason.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [entity.id, graph.dataset_version, graph.identity_hash, retry]);
  async function more(group: PropertyGroup) {
    setPending(group.collection); setError('');
    try {
      const result = await read<EntityProperties>('properties', new URLSearchParams({ entity_id: entity.id, dataset_version: graph.dataset_version, collection: group.collection, offset: String(group.next_offset) }));
      if (result.identity_hash !== graph.identity_hash) throw new Error('Identity links changed. Reload the graph.');
      setGroups(previous => previous.map(item => item.collection === group.collection ? { ...result.groups[0], records: [...item.records, ...result.groups[0].records] } : item));
      setDiagnostics(previous => [...previous, ...result.diagnostics]);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load properties.'); }
    finally { setPending(''); }
  }
  return <section aria-label="Entity properties" className="space-y-4 border-t border-white/10 pt-6"><h3 className="text-sm font-semibold">Properties</h3><p className="text-xs text-muted-foreground">Published values are shown with their sources. Different source values are kept separate.</p>
    {loading && <p role="status" className="text-sm text-muted-foreground">Loading properties…</p>}
    {error && <div role="alert" className="space-y-2 text-sm text-amber-200"><p>{error}</p><button className={button} onClick={() => setRetry(value => value + 1)}>Retry properties</button></div>}
    {!loading && groups.map(group => <div key={group.collection} className="space-y-3">{group.records.map(record => <article key={record.id} className="rounded-xl border border-white/10 p-4"><dl className="grid gap-x-6 gap-y-4 md:grid-cols-2">{Object.entries(record.fields).map(([key, value]) => <div key={key} className="min-w-0"><dt className="mb-1 text-xs text-muted-foreground">{key.replaceAll('_', ' ')}</dt><dd className="break-words text-sm leading-6"><PropertyValue value={value} /></dd></div>)}</dl>{record.limitations?.map((text, index) => <p key={index} className="mt-3 text-xs text-amber-200">{text}</p>)}<details className="mt-4 border-t border-white/10 pt-3 text-xs text-muted-foreground"><summary className="cursor-pointer">Source: {record.source_title ?? record.source_key ?? group.collection}</summary><p className="mt-2">{record.title}<SourceLink url={record.url ?? ''} /></p>{record.freshness && <p className="mt-2">Freshness: {record.freshness}</p>}{record.collected_at && <p className="mt-2">Collected: {record.collected_at}</p>}{(record.valid_from || record.valid_until) && <p className="mt-2">Published validity: {record.valid_from ?? 'Not specified'} – {record.valid_until ?? 'Not specified'}</p>}<p className="mt-2 break-all">Reference: {record.id}</p></details></article>)}{group.next_offset !== null && <button disabled={!!pending} onClick={() => more(group)} className={button}>{pending === group.collection ? 'Loading…' : `Load more properties (${group.records.length} of ${group.total} sources)`}</button>}</div>)}
    {diagnostics.length > 0 && <p className="text-xs text-amber-200">Some linked properties could not be resolved: {[...new Set(diagnostics.map(item => String(item.reason)))].join(', ')}.</p>}
    {!loading && !error && !groups.some(group => group.records.length) && <p className="text-sm text-muted-foreground">No linked properties available.</p>}
  </section>;
}
function PropertyValue({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span className="text-muted-foreground">Not published</span>;
  if (Array.isArray(value)) return value.length ? <ul className="space-y-2">{value.map((item, index) => <li key={index}><PropertyValue value={item} /></li>)}</ul> : <span className="text-muted-foreground">None listed</span>;
  if (typeof value === 'object') return <dl className="space-y-2 border-l border-white/15 pl-3">{Object.entries(value).map(([key, item]) => <div key={key}><dt className="text-xs text-muted-foreground">{key.replaceAll('_', ' ')}</dt><dd><PropertyValue value={item} /></dd></div>)}</dl>;
  const text = String(value);
  if (/^https?:\/\//.test(text) && safeSourceUrl(text)) return <a href={text} target="_blank" rel="noopener noreferrer" className="break-all text-sky-300 underline">{text}</a>;
  return <span className="whitespace-pre-wrap">{text === '' ? 'Empty value' : text}</span>;
}
