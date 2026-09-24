'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, ChevronRight, Download, Home, LayoutDashboard, LayoutGrid, RefreshCw, Search } from 'lucide-react';
import { ProjectionGraph, type GraphLayout } from './ProjectionGraph';
import { CAMPUS, kindLabel, traverse, type CampusEntity, type KnowledgeIndex, type TraversalStep } from '@/lib/knowledge-graph';
import { groupCoverage, type CoverageIssue } from '@/lib/coverage-issues';

async function read<T>(operation: string, params: URLSearchParams, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/brain/graph/${operation}?${params}`, { signal, cache: 'no-store' });
  const body = await response.json();
  if (!response.ok) throw new Error(response.status === 409 ? 'The campus release changed. Reload the graph to continue.' : body.error ?? body.detail ?? 'Could not load campus knowledge.');
  return body;
}
const button = 'rounded-lg border border-white/15 px-3 py-2 text-xs hover:bg-white/5 disabled:opacity-30';
const PAGE_SIZE = 8;
const LAYOUTS = [{ value: 'overview', label: 'Overview', Icon: LayoutDashboard }, { value: 'cards', label: 'Cards', Icon: LayoutGrid }] as const;
const LAYOUT_KEY = 'rockygpt-dev:campus-graph-layout';
function savedLayout(): GraphLayout {
  try {
    return window.localStorage.getItem(LAYOUT_KEY) === 'cards' ? 'cards' : 'overview';
  } catch {
    return 'overview';
  }
}

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
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState('');
  // Kept across entities and visits; the explorer only renders in the browser.
  const [layout, setLayout] = useState<GraphLayout>(savedLayout);
  const current = path.at(-1)!;
  const entity = current.type === 'entity' || current.type === 'attachment' ? graph.nodes.find(node => node.id === (current.type === 'entity' ? current.id : current.entityId)) : undefined;
  const categories = useMemo(() => [...new Set(graph.nodes.map(node => node.kind))].map(kind => ({ kind, label: kindLabel(kind), count: graph.nodes.filter(node => node.kind === kind).length })), [graph]);
  const categoryNodes = current.type === 'category' ? graph.nodes.filter(node => node.kind === current.kind && matches(node, current.query)) : [];
  const searchResults = search.trim() ? graph.nodes.filter(node => matches(node, search)) : [];
  function navigate(next: TraversalStep[]) {
    setPath(next); setSearch('');
    const last = next.at(-1)!;
    const url = new URL(window.location.href);
    if (last.type === 'entity' || last.type === 'attachment') url.searchParams.set('entity', last.type === 'entity' ? last.id : last.entityId); else url.searchParams.delete('entity');
    window.history.replaceState(null, '', url);
  }
  function open(node: CampusEntity, via?: string) { navigate(traverse(path, node, via)); }
  function changeLayout(next: GraphLayout) {
    setLayout(next);
    try {
      window.localStorage.setItem(LAYOUT_KEY, next);
    } catch {
      // The layout still changes for this visit when browser storage is unavailable.
    }
  }
  function category(kind: string) { navigate([...path, { type: 'category', kind, label: kindLabel(kind), query: '' }]); }
  function updateCategory(change: { query: string }) {
    setPath(previous => previous.map((step, index) => index === previous.length - 1 && step.type === 'category' ? { ...step, ...change } : step));
  }
  async function download() {
    setDownloading(true); setDownloadError('');
    try {
      const response = await fetch('/api/brain/graph/export', { cache: 'no-store', signal: AbortSignal.timeout(35_000) });
      if (!response.ok) throw new Error(response.status === 409 ? 'The release changed during export. Please retry.' : 'Could not export the complete published graph. Please retry.');
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a'); link.href = url; link.download = 'campus-knowledge-graph.json'; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (reason) {
      setDownloadError(reason instanceof Error ? reason.message : 'Could not download the graph.');
    } finally { setDownloading(false); }
  }
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
      <p>{graph.nodes.length.toLocaleString()} entities · {graph.edges.length.toLocaleString()} published relationships · {graph.dataset_version}</p>
      <div className="flex gap-2"><button onClick={download} disabled={downloading} className={`${button} flex items-center gap-2`}><Download size={14} />{downloading ? 'Exporting graph…' : 'Download graph'}</button><button onClick={reload} className={`${button} flex items-center gap-2`}><RefreshCw size={14} />Reload graph</button></div>
    </div>
    {downloadError && <p role="alert" className="text-xs text-amber-200">{downloadError}</p>}
    <section aria-label="Campus knowledge graph" className="overflow-hidden rounded-2xl border border-sky-400/20 bg-[#101820]">
      <header className="space-y-4 border-b border-white/10 p-5">
        <div className="flex items-start gap-3">
          <nav aria-label="Graph traversal" className="min-w-0 flex-1"><ol className="flex flex-wrap items-center gap-2 text-xs">
            {path.map((step, index) => <li key={index} className="flex min-w-0 items-center gap-2">
              {index > 0 && <span className="flex items-center gap-2 text-slate-400"><ChevronRight size={12} />{step.type === 'entity' && step.via && <span className="text-[10px]">{step.via}</span>}</span>}
              <button className="flex min-w-0 items-center gap-2 rounded px-1 py-1 text-sky-200 hover:bg-white/5" title={step.label} aria-current={index === path.length - 1 ? 'location' : undefined} aria-label={index === 0 ? 'Ramapo College home' : undefined} onClick={() => navigate(path.slice(0, index + 1))}>{index === 0 && <Home size={15} />}<span className="max-w-64 truncate">{step.label}</span></button>
            </li>)}
          </ol></nav>
          {entity && <div role="group" aria-label="Entity layout" className="flex shrink-0 rounded-lg border border-white/15 p-0.5">{LAYOUTS.map(({ value, label, Icon }) => <button key={value} type="button" aria-pressed={layout === value} onClick={() => changeLayout(value)}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs ${layout === value ? 'bg-sky-400/15 text-sky-100' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'}`}><Icon size={13} aria-hidden="true" />{label}</button>)}</div>}
        </div>
        <label className="flex items-center gap-2 rounded-lg border border-white/15 bg-black/20 px-3"><Search size={15} /><input aria-label="Search campus entities" placeholder="Search people, courses, clubs, places…" value={search} onChange={event => { setSearch(event.target.value); setSearchLimit(PAGE_SIZE); }} className="min-w-0 flex-1 bg-transparent py-3 text-xs outline-none" /></label>
        {search.trim() && <div aria-label="Entity search results" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{searchResults.slice(0, searchLimit).map(node => <EntityButton key={node.id} node={node} onClick={() => open(node, 'search')} />)}<p className="col-span-full text-xs text-muted-foreground">{searchResults.length} matching entities</p>{searchResults.length > searchLimit && <button className={button} onClick={() => setSearchLimit(value => value + PAGE_SIZE)}>Show more results</button>}</div>}
      </header>
      <div className="space-y-6 p-5">
        {current.type === 'campus' && <><div><h2 className="text-lg font-semibold">Explore Ramapo College</h2><p className="mt-2 text-sm text-muted-foreground">Choose a starting point, then follow the connections.</p></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{categories.map(item => <button key={item.kind} onClick={() => category(item.kind)} className="rounded-xl border border-sky-400/20 bg-sky-950/20 p-5 text-left hover:border-sky-300"><span className="block font-medium text-sky-100">{item.label}</span><span className="mt-2 block text-xs text-muted-foreground">{item.count.toLocaleString()} entities <ArrowRight className="ml-2 inline" size={13} /></span></button>)}</div></>}
        {current.type === 'category' && <><h2 className="text-lg font-semibold">{current.label}</h2><input aria-label={`Filter ${current.label}`} value={current.query} onChange={event => updateCategory({ query: event.target.value })} placeholder={`Find in ${current.label.toLowerCase()}…`} className="w-full rounded-lg border border-white/15 bg-black/20 p-3 text-sm" /><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{categoryNodes.map(node => <EntityButton key={node.id} node={node} onClick={() => open(node)} />)}</div><p className="text-xs text-muted-foreground">{categoryNodes.length.toLocaleString()} {current.query.trim() ? 'matching entities' : 'entities'}</p></>}
        {entity && <ProjectionGraph key={`${graph.dataset_version}:${entity.id}`} graph={graph} entity={entity} layout={layout} onOpen={open}
          attachmentId={current.type === 'attachment' ? current.nodeId : undefined}
          onAttachment={(nodeId, label) => navigate([...path, { type: 'attachment', label, entityId: entity.id, nodeId }])}
          onRoot={() => { const index = path.findLastIndex(step => step.type === 'entity' && step.id === entity.id); navigate(path.slice(0, index + 1)); }} />}
      </div>
    </section>
    {graph.diagnostics.length > 0 && <CoverageIssues issues={graph.diagnostics} />}
  </div>;
}

function matches(node: CampusEntity, query: string) { const q = query.trim().toLowerCase(); return [node.name, node.id, ...node.aliases].some(value => value.toLowerCase().includes(q)); }
function CoverageIssues({ issues }: { issues: CoverageIssue[] }) {
  const groups = useMemo(() => groupCoverage(issues), [issues]);
  return <details className="rounded-xl border border-amber-400/20 p-4 text-xs"><summary className="cursor-pointer text-amber-200">{issues.length.toLocaleString()} data coverage issues</summary>
    <p className="mt-3 text-muted-foreground">Unresolved references remain unlinked. Categories are entry points, not factual relationships.</p>
    <div className="mt-3 space-y-2">{groups.map(group => <details key={group.id} open={group.id === 'unlinked_record'} className="rounded-lg border border-white/10 p-3">
      <summary className="cursor-pointer"><span className="font-medium text-amber-100">{group.label}</span><span className="text-muted-foreground"> · {group.issues.length.toLocaleString()}</span></summary>
      <p className="mt-2 text-muted-foreground">{group.description}</p>
      <p className="mt-1 text-muted-foreground">{group.collections.map(([collection, count]) => `${collection.replaceAll('_', ' ')} ${count.toLocaleString()}`).join(' · ')}</p>
      <ul className="mt-3 max-h-64 space-y-2 overflow-auto">{group.issues.map((issue, index) => <li key={index}>{[typeof issue.collection === 'string' && issue.collection.replaceAll('_', ' '), issue.entity, issue.record, issue.reason].filter(Boolean).map(String).join(' · ')}</li>)}</ul>
    </details>)}</div>
  </details>;
}
function EntityButton({ node, onClick }: { node: CampusEntity; onClick: () => void }) { return <button onClick={onClick} className="flex items-center justify-between gap-3 rounded-xl border border-white/15 p-4 text-left hover:border-sky-300/70 hover:bg-sky-400/5"><span><span className="block text-sm text-sky-100">{node.name}</span><span className="mt-1 block text-xs text-muted-foreground">{node.kind.replaceAll('_', ' ')}</span></span><ArrowRight size={14} className="shrink-0 text-sky-300" /></button>; }
