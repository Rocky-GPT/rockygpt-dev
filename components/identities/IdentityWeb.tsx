'use client';

import { useEffect, useId, useMemo, useState, type ReactNode, type KeyboardEvent } from 'react';
import { RecordGraph } from './RecordGraph';
import type { GraphScope } from '@/lib/campus-graph';
import { ArrowRight, ChevronLeft, ChevronRight, ExternalLink, Focus, Home, Minus, Network, Plus, Search, X } from 'lucide-react';
import {
  identityNeighborhood, KIND_LABELS, safeSourceUrl, type Identity, type IdentityKind,
  type IdentityWebEdge, type IdentityWebNode, type ProfileResponse, type ProfileSection,
} from '@/lib/identities';

type Props = {
  search: ReactNode;
  datasetVersion: string;
  identityHash: string;
  navigationEpoch: number;
  entity?: Identity;
  identities: Identity[];
  profile?: ProfileResponse;
  onSection: (section: ProfileSection) => void;
  onSelectEntity: (id: string) => void;
  onClearSelection: () => void;
};
type Mode = 'campus' | 'category' | 'identity';
type VisualNode = {
  id: string; label: string; detail: string; type: 'root' | 'category' | 'identity' | 'sources' | 'course' | 'records';
  x: number; y: number; active?: boolean; expanded?: boolean; activate: () => void;
};
type VisualEdge = { id: string; from: string; to: string; label: string; type: 'browse' | 'source' | 'relation'; original?: IdentityWebEdge };
const PAGE_SIZE = 8;
const CENTER = { x: 560, y: 410 };
const RELATION_LABELS = { convener: 'has convener', organized_by: 'organized by', profile_course: 'profile-listed course', source: 'original records' };
const COLLECTION_LABELS: Record<string, string> = {
  contacts: 'Contact records', faculty: 'Faculty profiles', campus_hours: 'Campus schedules',
  dining_hours: 'Dining schedules', menu: 'Menu offerings', programs: 'Academic programs',
  courses: 'Catalog courses', clubs: 'Club records', events: 'Event occurrences',
};

function position(index: number, count: number, radiusX: number, radiusY: number, offset = -Math.PI / 2) {
  const angle = offset + index / Math.max(count, 1) * Math.PI * 2;
  return { x: CENTER.x + Math.cos(angle) * radiusX, y: CENTER.y + Math.sin(angle) * radiusY };
}
function nameLines(name: string): string[] {
  const words = name.split(/\s+/);
  const lines = [''];
  for (const word of words) {
    const i = lines.length - 1;
    if (lines[i].length + word.length > 19 && lines[i]) {
      if (lines.length === 2) { lines[i] = `${lines[i].slice(0, 17)}…`; break; }
      lines.push(word);
    } else lines[i] += `${lines[i] ? ' ' : ''}${word}`;
  }
  return lines.map(line => line.length > 20 ? `${line.slice(0, 18)}…` : line);
}
function activateKey(event: KeyboardEvent<SVGGElement>, activate: () => void) {
  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activate(); }
}
function sectionForEdge(edge: IdentityWebEdge): ProfileSection {
  return edge.type === 'organized_by' ? 'event' : edge.type === 'convener' ? 'conveners' : 'courses';
}

export function IdentityWeb({ search, datasetVersion, identityHash, navigationEpoch, entity, identities, profile, onSection, onSelectEntity, onClearSelection }: Props) {
  const [recordScope, setRecordScope] = useState<GraphScope>();
  const [mode, setMode] = useState<Mode>(entity ? 'identity' : 'campus');
  const [category, setCategory] = useState<IdentityKind>('person');
  const [categoryQuery, setCategoryQuery] = useState('');
  const [page, setPage] = useState(0);
  const [expandedIds, setExpandedIds] = useState<string[]>(entity ? [entity.id] : []);
  const [edgeId, setEdgeId] = useState<string>();
  const markerId = useId().replaceAll(':', '');
  const selectedId = entity?.id;
  useEffect(() => { setRecordScope(undefined); }, [navigationEpoch, selectedId]);
  useEffect(() => {
    if (!selectedId) return;
    setMode('identity'); setEdgeId(undefined);
    setExpandedIds(ids => [selectedId, ...ids.filter(id => id !== selectedId)]);
  }, [selectedId]);
  const neighborhood = useMemo(() => identityNeighborhood(identities, selectedId ?? '', expandedIds), [identities, selectedId, expandedIds]);
  const byId = new Map(identities.map(item => [item.id, item]));
  const counts = Object.fromEntries(Object.keys(KIND_LABELS).map(kind => [kind, identities.filter(item => item.kind === kind).length]));
  const query = categoryQuery.trim().toLowerCase();
  const categoryItems = identities.filter(item => item.kind === category && [item.name, item.id, ...item.aliases].some(value => value.toLowerCase().includes(query)));
  const pageCount = Math.max(1, Math.ceil(categoryItems.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageItems = categoryItems.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const selectedEdge = neighborhood.edges.find(edge => edge.id === edgeId);

  function home() {
    setRecordScope(undefined); setMode('campus'); setExpandedIds([]); setEdgeId(undefined); setCategoryQuery(''); setPage(0); onClearSelection();
  }
  function browse(kind: IdentityKind) {
    setRecordScope(undefined); setCategory(kind); setMode('category'); setCategoryQuery(''); setPage(0); setEdgeId(undefined); onClearSelection();
  }
  function openIdentity(id: string) {
    setRecordScope(undefined);
    setExpandedIds(ids => [id, ...ids.filter(value => value !== id)]);
    setMode('identity'); setEdgeId(undefined); onSelectEntity(id);
  }
  function inspectSection(ownerId: string, section: ProfileSection) {
    if (selectedId !== ownerId) onSelectEntity(ownerId);
    onSection(section);
  }
  function activateRecord(node: IdentityWebNode) {
    if (node.type === 'identity') { openIdentity(node.entity.id); return; }
    setRecordScope({ collection: node.type === 'sources' ? node.collection : node.reference.collection, entityId: node.type === 'sources' ? node.ownerId : undefined, ownerName: byId.get(node.ownerId)?.name, ...(node.type === 'course' ? { reference: node.reference } : {}) });
  }

  const nodes: VisualNode[] = [];
  const edges: VisualEdge[] = [];
  if (mode === 'campus' || (mode === 'identity' && !entity)) {
    nodes.push({ id: 'campus', label: 'Ramapo College', detail: 'Campus data · start here', type: 'root', ...CENTER, activate: home });
    const kinds = Object.entries(KIND_LABELS) as [IdentityKind, string][];
    kinds.forEach(([kind, label], index) => {
      nodes.push({ id: `kind:${kind}`, label, detail: `${counts[kind]} identities · browse`, type: 'category', ...position(index, kinds.length + 1, 360, 260), activate: () => browse(kind) });
      edges.push({ id: `browse:${kind}`, from: 'campus', to: `kind:${kind}`, label: 'browse category', type: 'browse' });
    });
    nodes.push({ id: 'records', label: 'All source records', detail: 'Including unlinked data · expand', type: 'records', ...position(kinds.length, kinds.length + 1, 360, 260), activate: () => setRecordScope({}) });
    edges.push({ id: 'browse:records', from: 'campus', to: 'records', label: 'browse records', type: 'browse' });
  } else if (mode === 'category') {
    nodes.push({ id: 'category', label: KIND_LABELS[category], detail: `${counts[category]} curated identities`, type: 'category', ...CENTER, active: true, activate: () => setCategoryQuery('') });
    pageItems.forEach((item, index) => {
      nodes.push({ id: item.id, label: item.name, detail: 'Select to explore connections', type: 'identity', ...position(index, Math.max(pageItems.length, 3), 355, 265), activate: () => openIdentity(item.id) });
      edges.push({ id: `browse:${item.id}`, from: 'category', to: item.id, label: 'browse identity', type: 'browse' });
    });
  } else if (entity) {
    const neighbors = neighborhood.nodes.filter(node => node.type === 'identity' && node.id !== entity.id);
    const records = neighborhood.nodes.filter(node => node.type !== 'identity');
    for (const node of neighborhood.nodes) {
      if (node.type === 'identity') {
        const focused = node.id === entity.id;
        nodes.push({ id: node.id, label: node.entity.name, detail: `${node.entity.kind === 'program' ? 'Academic program' : node.entity.kind} · ${node.expanded ? 'expanded' : 'click to expand'}`, type: 'identity', active: focused, expanded: node.expanded,
          ...(focused ? CENTER : position(neighbors.findIndex(item => item.id === node.id), neighbors.length, 255, 170)), activate: () => openIdentity(node.id) });
      } else {
        const label = node.type === 'sources' ? COLLECTION_LABELS[node.collection] ?? node.collection : node.reference.source_record_key;
        nodes.push({ id: node.id, label, detail: node.type === 'sources' ? `${node.count.toLocaleString()} original record links` : 'Undated list · catalog record', type: node.type,
          ...position(records.findIndex(item => item.id === node.id), records.length, 475, 335, -Math.PI / 2 + 0.18), activate: () => activateRecord(node) });
      }
    }
    edges.push(...neighborhood.edges.map(edge => ({ id: edge.id, from: edge.from, to: edge.to, label: RELATION_LABELS[edge.type], type: edge.type === 'source' ? 'source' as const : 'relation' as const, original: edge })));
  }
  const coordinates = new Map(nodes.map(node => [node.id, node]));
  const nodeClass = (node: VisualNode) => node.type === 'root' || node.active
    ? { fill: '#0a3048', stroke: '#7dd3fc', text: '#e0f2fe' }
    : node.type === 'identity' ? { fill: '#102f30', stroke: '#2dd4bf', text: '#ccfbf1' }
      : node.type === 'course' ? { fill: '#29213e', stroke: '#a78bfa', text: '#ede9fe' }
        : node.type === 'sources' ? { fill: '#12283b', stroke: '#38bdf8', text: '#bae6fd' }
          : { fill: '#202b36', stroke: '#64748b', text: '#e2e8f0' };

  return <section className="@container overflow-hidden rounded-2xl border border-sky-400/20 bg-[#101820]" aria-label="Campus Graph">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-4 sm:px-5">
      <div className="flex min-w-0 items-center gap-2 text-sm">
        <button type="button" onClick={home} className="flex shrink-0 items-center gap-2 rounded-md text-sky-200 hover:text-white" aria-label="Ramapo College home"><Home className="h-4 w-4" />Ramapo College</button>
        {mode === 'category' && <><ChevronRight className="h-3 w-3 text-neutral-500" /><span className="truncate text-xs text-neutral-300">{KIND_LABELS[category]}</span></>}
        {mode === 'identity' && entity && <><ChevronRight className="h-3 w-3 shrink-0 text-neutral-500" /><button type="button" onClick={() => browse(entity.kind)} className="text-xs text-neutral-300 hover:text-white">{KIND_LABELS[entity.kind]}</button></>}
      </div>
      {search}
    </div>
    {recordScope ? <RecordGraph key={JSON.stringify([recordScope, datasetVersion, identityHash])} scope={recordScope} datasetVersion={datasetVersion} identityHash={identityHash} onClose={() => setRecordScope(undefined)} /> : <>
    <div className="space-y-3 px-4 pt-4 sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="flex items-center gap-2 text-sm font-semibold"><Network className="h-4 w-4 text-sky-300" />{mode === 'campus' ? 'Explore campus connections' : mode === 'category' ? KIND_LABELS[category] : entity?.name}</h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">{mode === 'identity' ? 'Select an identity to expand its neighborhood. Select a record group to expand its records and fields, or an edge to inspect its evidence.' : 'Browse a category, or use identity search to jump directly to a person, place, club, or event. Categories organize this view; they do not assert factual relationships.'}</p></div>
        {mode === 'identity' && entity && <div className="flex flex-wrap gap-2 text-[11px]">
          <button type="button" onClick={() => setExpandedIds(ids => ids.includes(entity.id) ? ids.filter(id => id !== entity.id) : [entity.id, ...ids])} className="flex items-center gap-1 rounded-lg border border-white/15 px-2.5 py-2 hover:bg-white/5">{expandedIds.includes(entity.id) ? <Minus className="h-3 w-3" /> : <Plus className="h-3 w-3" />}{expandedIds.includes(entity.id) ? 'Collapse selection' : 'Expand selection'}</button>
          <button type="button" onClick={() => { setExpandedIds([entity.id]); setEdgeId(undefined); }} className="flex items-center gap-1 rounded-lg border border-white/15 px-2.5 py-2 hover:bg-white/5"><Focus className="h-3 w-3" />Focus selection</button>
          <button type="button" onClick={() => { setExpandedIds([]); setEdgeId(undefined); }} className="rounded-lg border border-white/15 px-2.5 py-2 hover:bg-white/5">Clear expansion</button>
        </div>}
      </div>
      {mode === 'category' && <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex min-w-[180px] items-center gap-2 rounded-lg border border-white/15 bg-black/20 px-3"><Search className="h-3.5 w-3.5 text-muted-foreground" /><input aria-label={`Search ${KIND_LABELS[category]}`} value={categoryQuery} onChange={event => { setCategoryQuery(event.target.value); setPage(0); }} placeholder={`Search ${KIND_LABELS[category].toLowerCase()}…`} className="w-full bg-transparent py-2 text-xs outline-none" /></label>
        <div className="flex items-center gap-3 text-xs text-muted-foreground"><span>{categoryItems.length ? currentPage * PAGE_SIZE + 1 : 0}–{Math.min((currentPage + 1) * PAGE_SIZE, categoryItems.length)} of {categoryItems.length}</span><button type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)} aria-label="Previous identities" className="rounded border border-white/15 p-1.5 disabled:opacity-30"><ChevronLeft className="h-3.5 w-3.5" /></button><button type="button" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)} aria-label="Next identities" className="rounded border border-white/15 p-1.5 disabled:opacity-30"><ChevronRight className="h-3.5 w-3.5" /></button></div>
      </div>}
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-[10px] text-muted-foreground" aria-label="Graph connection legend">
        <span className="flex items-center gap-1.5"><span className="w-5 border-t border-dotted border-slate-400" />Browse / scope</span>
        <span className="flex items-center gap-1.5"><span className="w-5 border-t border-dashed border-teal-400" />Evidence-backed relationship</span>
        <span className="flex items-center gap-1.5"><span className="w-5 border-t border-sky-400" />Original source records</span>
      </div>
      {mode === 'identity' && (neighborhood.omittedIdentities > 0 || neighborhood.omittedRecordGroups > 0 || neighborhood.unavailableTargets > 0) && <p role="status" className="rounded-lg bg-amber-400/5 p-3 text-xs text-amber-200">View limit: {neighborhood.omittedIdentities} neighboring identities and {neighborhood.omittedRecordGroups} record groups are outside this view. Focus an identity to explore its neighborhood.{neighborhood.unavailableTargets > 0 ? ` ${neighborhood.unavailableTargets} relationship targets are unavailable in this release.` : ''}</p>}
    </div>

    <div className="hidden @min-[700px]:block">
      <svg viewBox="0 0 1120 820" className="h-[560px] max-h-[65vh] min-h-[360px] w-full" role="group" aria-label="Interactive campus connection map">
        <defs><pattern id={`${markerId}-dots`} width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="#52606b" opacity="0.18" /></pattern><marker id={`${markerId}-arrow`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#2dd4bf" /></marker></defs>
        <rect width="1120" height="820" fill={`url(#${markerId}-dots)`} />
        <ellipse cx="560" cy="410" rx="255" ry="170" fill="none" stroke="#475569" strokeOpacity="0.16" />
        {edges.map(edge => {
          const from = coordinates.get(edge.from); const to = coordinates.get(edge.to); if (!from || !to) return null;
          const color = edge.type === 'browse' ? '#64748b' : edge.type === 'source' ? '#38bdf8' : '#2dd4bf';
          const x = (from.x + to.x) / 2; const y = (from.y + to.y) / 2;
          const inspect = () => edge.original && setEdgeId(edge.id);
          return <g key={edge.id}>
            <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke={color} strokeWidth={edgeId === edge.id ? 3 : 1.5} strokeOpacity={edgeId === edge.id ? 1 : 0.5} strokeDasharray={edge.type === 'browse' ? '2 7' : edge.type === 'relation' ? '6 5' : undefined} />
            {edge.type === 'relation' && <g role="button" tabIndex={0} aria-label={`Inspect ${from.label} ${edge.label} ${to.label}`} onClick={inspect} onKeyDown={event => activateKey(event, inspect)} className="cursor-pointer">
              <title>{from.label} → {edge.label} → {to.label}. Inspect original evidence.</title>
              <rect x={x - 67} y={y - 12} width="134" height="24" rx="12" fill="#103031" stroke="#2dd4bf" strokeOpacity="0.4" />
              <text x={x} y={y + 4} textAnchor="middle" fill="#99f6e4" fontSize="10">{edge.label} →</text>
            </g>}
          </g>;
        })}
        {nodes.map(node => {
          const colors = nodeClass(node); const width = node.active || node.type === 'root' ? 184 : 160; const lines = nameLines(node.label);
          return <g key={node.id} role="button" tabIndex={0} aria-label={`${node.label}. ${node.detail}`} onClick={node.activate} onKeyDown={event => activateKey(event, node.activate)} className="cursor-pointer">
            <title>{node.label} — {node.detail}</title>
            {node.active && <rect x={node.x - width / 2 - 5} y={node.y - 39} width={width + 10} height="78" rx="18" fill="none" stroke="#7dd3fc" strokeOpacity="0.15" strokeWidth="7" />}
            <rect x={node.x - width / 2} y={node.y - 34} width={width} height="68" rx={node.type === 'identity' || node.type === 'root' ? 15 : 8} fill={colors.fill} stroke={colors.stroke} strokeOpacity={node.active ? 1 : 0.65} strokeWidth={node.active ? 1.75 : 1} strokeDasharray={node.type === 'course' ? '3 3' : undefined} />
            {lines.map((line, index) => <text key={index} x={node.x} y={node.y - (lines.length === 1 ? 4 : 12) + index * 17} textAnchor="middle" fill={colors.text} fontSize="14" fontWeight="600">{line}</text>)}
            <text x={node.x} y={node.y + 24} textAnchor="middle" fill="#94a3b8" fontSize="10">{node.detail.length > 28 ? `${node.detail.slice(0, 26)}…` : node.detail}</text>
          </g>;
        })}
      </svg>
    </div>
    <div className="grid gap-2 p-4 sm:grid-cols-2 @min-[700px]:hidden" aria-label="Campus graph nodes">
      {nodes.map(node => <button key={node.id} type="button" onClick={node.activate} className={`flex items-center gap-3 rounded-xl border p-3 text-left ${node.active || node.type === 'root' ? 'border-sky-400/60 bg-sky-950/40' : node.type === 'identity' ? 'border-teal-400/30 bg-teal-950/20' : 'border-white/15 bg-white/[0.02]'}`}><span className="min-w-0 flex-1"><span className="block text-xs font-medium">{node.label}</span><span className="mt-1 block text-[10px] text-muted-foreground">{node.detail}</span></span><ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /></button>)}
    </div>
    {mode === 'category' && !categoryItems.length && <p className="px-5 pb-5 text-sm text-muted-foreground">No identities match this category search. All original data remains available in source records.</p>}
    {mode === 'identity' && entity && <div className="space-y-3 border-t border-white/10 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-[11px] text-muted-foreground">{neighborhood.nodes.filter(node => node.type === 'identity').length} identities · {neighborhood.nodes.filter(node => node.type !== 'identity').length} record groups · {expandedIds.length} expanded</p><p className="text-[10px] text-muted-foreground">Record groups keep menus and other large collections compact.</p></div>
      <div className="flex flex-wrap gap-2" aria-label="Inspect graph edges">{edges.filter(edge => edge.original).map(edge => <button key={edge.id} type="button" aria-pressed={edgeId === edge.id} onClick={() => setEdgeId(edge.id)} className={`max-w-full truncate rounded-full border px-3 py-1.5 text-[10px] ${edgeId === edge.id ? 'border-teal-300/50 bg-teal-400/10 text-teal-100' : 'border-white/15 text-neutral-300 hover:bg-white/5'}`} title={`${coordinates.get(edge.from)?.label} → ${edge.label} → ${coordinates.get(edge.to)?.label}`}>{coordinates.get(edge.from)?.label} <span className="text-teal-300">· {edge.label} ·</span> {coordinates.get(edge.to)?.label}</button>)}</div>
      {selectedEdge && <div className="rounded-xl border border-teal-400/25 bg-black/20 p-4" aria-label="Connection evidence">
        <div className="flex items-start justify-between gap-3"><div><h3 className="text-sm font-semibold text-teal-100">{RELATION_LABELS[selectedEdge.type]}</h3><p className="mt-1 text-xs text-muted-foreground">{byId.get(selectedEdge.from)?.name} → {coordinates.get(selectedEdge.to)?.label}</p></div><button type="button" onClick={() => setEdgeId(undefined)} aria-label="Close connection evidence" className="rounded p-1 text-muted-foreground"><X className="h-4 w-4" /></button></div>
        {selectedEdge.type === 'source' ? <div className="mt-3 space-y-3">{selectedEdge.links?.map((link, index) => <div key={index} className="text-xs"><p className="font-mono text-sky-200">{link.collection} · {link.source_key}</p><p className="mt-1 text-muted-foreground">{link.source_record_keys.length} original record keys{link.source_record_ids ? ` · ${link.source_record_ids.length} pinned original row IDs` : ''}</p><details className="mt-2"><summary className="cursor-pointer text-sky-300">Inspect exact record references</summary><pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded bg-black/20 p-3 text-[10px]">{JSON.stringify(link, null, 2)}</pre></details></div>)}</div>
          : <ul className="mt-3 space-y-3">{selectedEdge.evidence.map((reference, index) => {
            const url = reference.source_url ? safeSourceUrl(reference.source_url) : undefined;
            const capture = profile?.profile.records.find(record => record.collection === reference.collection && record.source_key === reference.source_key && reference.source_record_id && record.id.startsWith(`${reference.collection}:${reference.source_record_id}`) && reference.field.split('.').reduce<unknown>((value, key) => value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined, record.fields) !== undefined);
            return <li key={index} className="rounded-lg border border-white/10 p-3 text-[11px]"><p className="break-all font-mono text-teal-100">{reference.collection} · {reference.source_key}</p><dl className="mt-2 space-y-1 text-muted-foreground"><div><dt className="inline">Original record key: </dt><dd className="inline break-all font-mono">{reference.source_record_key}</dd></div>{reference.source_record_id && <div><dt className="inline">Original row ID: </dt><dd className="inline break-all font-mono">{reference.source_record_id}</dd></div>}<div><dt className="inline">Published field: </dt><dd className="inline font-mono text-neutral-200">{reference.field}</dd></div><div><dt className="inline">Source collected: </dt><dd className="inline">{capture?.collected_at ?? 'Not included in this link; inspect profile evidence'}</dd></div></dl>{url && <a href={url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-sky-300 hover:underline">Open original source<ExternalLink className="h-3 w-3" /></a>}</li>;
          })}</ul>}
        <button type="button" onClick={() => {
          const node = neighborhood.nodes.find(item => item.id === selectedEdge.to);
          inspectSection(selectedEdge.from, selectedEdge.type === 'source' && node && node.type !== 'identity' ? node.section : sectionForEdge(selectedEdge));
        }} className="mt-4 flex items-center gap-2 rounded-lg border border-sky-400/30 bg-sky-400/10 px-3 py-2 text-xs text-sky-200">Inspect profile evidence<ArrowRight className="h-3 w-3" /></button>
      </div>}
      {!edges.length && <p className="text-xs text-muted-foreground">No connections are expanded. Expand the selection to see published links.</p>}
    </div>}
    </>}
    <p className="border-t border-white/10 bg-black/10 px-5 py-3 text-[10px] leading-5 text-muted-foreground">Ramapo College and category nodes provide navigation within this campus dataset. Factual relationships use explicit stored evidence; identity links do not rank source authority or establish shared availability.</p>
  </section>;
}
