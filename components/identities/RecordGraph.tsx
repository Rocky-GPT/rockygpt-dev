'use client';

import { useEffect, useId, useState, type KeyboardEvent } from 'react';
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, ExternalLink, Loader2 } from 'lucide-react';
import { safeSourceUrl } from '@/lib/identities';
import {
  GRAPH_PAGE_SIZE, childCount, graphUrl, nextGroupField, valueAtPath, valueChildren, valuePreview,
  type GraphBrowse, type GraphCollection, type GraphFilters, type GraphScope, type GraphSnapshot, type JsonPath,
} from '@/lib/campus-graph';

type Frame = { label: string; offset: number } & (
  | { kind: 'collections' }
  | { kind: 'browse'; collection: string; filters: GraphFilters; entityId?: string }
  | { kind: 'record'; collection: string; recordId?: string; reference?: GraphScope['reference']; entityId?: string }
  | { kind: 'value'; value: unknown; path: JsonPath }
  | { kind: 'remote'; collection: string; recordId: string; path: JsonPath }
);
type Navigation = { label: string; collection: string; filters: GraphFilters };
type RecordResult = GraphSnapshot & { record: Record<string, unknown> & { navigation?: Navigation[] }; diagnostics?: unknown[] };
type RemoteValue = GraphSnapshot & {
  kind: string; total: number; next_offset: number | null; value?: unknown;
  artifact_key: string; path: JsonPath; content_hash: string; created_at: string;
  children: { key: string | number; label: string; kind: string; preview: string; count?: number; value?: unknown }[];
};
type ResponseData = GraphBrowse | RecordResult | RemoteValue;
type Child = { id: string; label: string; detail: string; activate?: () => void };
type Props = { scope: GraphScope; datasetVersion: string; identityHash: string; onClose: () => void };

async function readGraph<T extends GraphSnapshot>(url: string, signal: AbortSignal, hash: string): Promise<T> {
  const response = await fetch(url, { signal, cache: 'no-store' });
  const body = await response.json();
  if (!response.ok) throw new Error(response.status === 409
    ? 'The active data release changed. Reload identities above to browse a matching release.'
    : body.error ?? body.detail ?? `Could not load this node (HTTP ${response.status}).`);
  if (body.identity_hash !== hash) throw new Error('The identity map changed. Reload identities before continuing.');
  return body as T;
}

function initialFrame(scope: GraphScope): Frame {
  if (scope.collection && scope.reference) return { kind: 'record', collection: scope.collection, reference: scope.reference, label: scope.reference.source_record_key, offset: 0 };
  if (scope.collection) return { kind: 'browse', collection: scope.collection, entityId: scope.entityId, filters: {}, label: scope.collection, offset: 0 };
  return { kind: 'collections', label: 'All source data', offset: 0 };
}

function nodeLines(label: string): string[] {
  const words = label.match(/.{1,23}(?:\s|$)|.{1,23}/g) ?? [label];
  return words.slice(0, 2).map((word, index) => index === 1 && words.length > 2 ? `${word.trim().slice(0, 21)}…` : word.trim());
}

function storedValue(value: unknown): string {
  return typeof value === 'string' ? value === '' ? '""' : value : JSON.stringify(value, null, 2) ?? '';
}

function LeafNode({ label, value }: { label: string; value: string }) {
  return <div role="group" aria-label={`${label} value`} className="flex h-full min-w-0 flex-col rounded-xl border border-sky-400/40 bg-[#12283b] p-3 text-center">
    <span className="mb-1.5 block break-words text-xs font-medium text-sky-200">{label}</span>
    <pre tabIndex={0} aria-label={`${label} stored value`} className="max-h-20 overflow-auto whitespace-pre-wrap [overflow-wrap:anywhere] font-sans text-xs leading-5 text-sky-50">{value}</pre>
  </div>;
}

export function RecordGraph({ scope, datasetVersion, identityHash, onClose }: Props) {
  const [frames, setFrames] = useState<Frame[]>(() => [initialFrame(scope)]);
  const [catalogue, setCatalogue] = useState<GraphCollection[]>();
  const [data, setData] = useState<ResponseData>();
  const [error, setError] = useState('');
  const [catalogueError, setCatalogueError] = useState('');
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const frame = frames[frames.length - 1];
  const marker = useId().replaceAll(':', '');
  const collection = 'collection' in frame ? catalogue?.find(item => item.id === frame.collection) : undefined;
  const groupBy = frame.kind === 'browse' ? nextGroupField(collection, frame.filters) : undefined;
  const label = frame.kind === 'browse' && Object.keys(frame.filters).length === 0 ? collection?.label ?? frame.label : frame.label;

  useEffect(() => {
    const controller = new AbortController();
    setCatalogueError('');
    readGraph<GraphSnapshot & { collections: GraphCollection[] }>(graphUrl('collections', datasetVersion), controller.signal, identityHash)
      .then(result => { if (!controller.signal.aborted) setCatalogue(result.collections); })
      .catch(reason => { if (!controller.signal.aborted) setCatalogueError(reason instanceof Error ? reason.message : 'Could not load source collections.'); });
    return () => controller.abort();
  }, [datasetVersion, identityHash, retry]);

  useEffect(() => {
    const controller = new AbortController();
    setData(undefined); setError('');
    if (frame.kind === 'collections' || frame.kind === 'value') { setLoading(false); return () => controller.abort(); }
    if (!catalogue) { setLoading(true); return () => controller.abort(); }
    const params = frame.kind === 'browse' ? { collection: frame.collection, entity_id: frame.entityId, filters: frame.filters, group_by: groupBy, offset: frame.offset, limit: GRAPH_PAGE_SIZE }
      : frame.kind === 'record' ? { collection: frame.collection, entity_id: frame.entityId, record_id: frame.recordId, ...frame.reference }
        : { collection: frame.collection, record_id: frame.recordId, path: frame.path, offset: frame.offset, limit: GRAPH_PAGE_SIZE };
    setLoading(true);
    readGraph<ResponseData>(graphUrl(frame.kind === 'remote' ? 'value' : frame.kind, datasetVersion, params), controller.signal, identityHash)
      .then(result => { if (!controller.signal.aborted) setData(result); })
      .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Could not load this node.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [frame, catalogue, groupBy, datasetVersion, identityHash, retry]);

  function push(next: Frame) { setFrames(previous => [...previous, next]); }
  function page(offset: number) { setFrames(previous => [...previous.slice(0, -1), { ...previous[previous.length - 1], offset }]); }
  function openRecord(collectionId: string, id: string, title: string, entityId?: string) {
    if (collectionId === 'artifacts') push({ kind: 'remote', collection: collectionId, recordId: id, path: [], label: title, offset: 0 });
    else push({ kind: 'record', collection: collectionId, recordId: id, entityId, label: title, offset: 0 });
  }

  let total = 0;
  let nextOffset: number | null = null;
  let exactValue: unknown;
  let hasExactValue = false;
  let provenance: Record<string, unknown> | undefined;
  let artifactProvenance: RemoteValue | undefined;
  let diagnostics: unknown[] = [];
  let children: Child[] = [];
  if (frame.kind === 'collections' && catalogue) {
    total = catalogue.length;
    children = catalogue.slice(frame.offset, frame.offset + GRAPH_PAGE_SIZE).map(item => ({ id: item.id, label: item.label, detail: item.status === 'unavailable' ? 'Unavailable projection · inspect issue' : `${item.total.toLocaleString()} records`, activate: () => push({ kind: 'browse', collection: item.id, filters: {}, label: item.label, offset: 0 }) }));
    nextOffset = frame.offset + GRAPH_PAGE_SIZE < total ? frame.offset + GRAPH_PAGE_SIZE : null;
  } else if (frame.kind === 'browse' && data && 'mode' in data) {
    total = data.total; nextOffset = data.next_offset; diagnostics = data.diagnostics ?? [];
    if (data.mode === 'groups' && groupBy) children = (data.groups ?? []).map((group, index) => ({
      id: JSON.stringify([groupBy, group.value, index]), label: group.label, detail: `${group.count.toLocaleString()} records · expand`,
      activate: () => push({ ...frame, filters: { ...frame.filters, [groupBy]: group.value }, label: group.label, offset: 0 }),
    }));
    else children = (data.records ?? []).map(record => ({ id: record.id, label: record.title, detail: `Record ${record.source_record_id?.slice(0, 8) ?? record.id} · expand`, activate: () => openRecord(frame.collection, record.id, record.title, frame.entityId) }));
  } else if ((frame.kind === 'record' && data && 'record' in data) || frame.kind === 'value') {
    const root = frame.kind === 'value' ? frame.value : (data as RecordResult).record;
    const path = frame.kind === 'value' ? frame.path : [];
    const result = valueAtPath(root, path);
    if (result.found) {
      const value = result.value;
      const navigation = frame.kind === 'record' ? (data as RecordResult).record.navigation ?? [] : [];
      if (frame.kind === 'record') diagnostics = (data as RecordResult).diagnostics ?? [];
      total = childCount(value) + navigation.length;
      const entries = valueChildren(value, 0, childCount(value));
      if (frame.kind === 'record') entries.sort((a, b) => Number(b.key === 'fields') - Number(a.key === 'fields'));
      const fields: Child[] = entries.map(child => {
        const expandable = childCount(child.value) > 0;
        return { id: JSON.stringify([...path, child.key]), label: child.label,
          detail: expandable ? valuePreview(child.value) : storedValue(child.value),
          activate: expandable ? () => push({ kind: 'value', value: root, path: [...path, child.key], label: child.label, offset: 0 }) : undefined };
      });
      const linked = navigation.map((item, index) => ({ id: `browse:${index}`, label: item.label, detail: 'Browse linked source rows', activate: () => push({ kind: 'browse', collection: item.collection, filters: item.filters, label: item.label, offset: 0 }) }));
      children = [...linked, ...fields].slice(frame.offset, frame.offset + GRAPH_PAGE_SIZE);
      nextOffset = frame.offset + GRAPH_PAGE_SIZE < total ? frame.offset + GRAPH_PAGE_SIZE : null;
      if (!total) { exactValue = value; hasExactValue = true; }
      if (root !== null && typeof root === 'object') provenance = root as Record<string, unknown>;
    }
  } else if (frame.kind === 'remote' && data && 'children' in data) {
    total = data.total; nextOffset = data.next_offset; artifactProvenance = data;
    children = data.children.map(child => {
      const expandable = (child.kind === 'object' || child.kind === 'array') && (child.count ?? 0) > 0;
      return { id: JSON.stringify([...frame.path, child.key]), label: child.label,
        detail: !expandable && 'value' in child ? storedValue(child.value) : child.preview,
        activate: expandable ? () => push({ ...frame, path: [...frame.path, child.key], label: child.label, offset: 0 }) : undefined };
    });
    if (data.kind !== 'object' && data.kind !== 'array' || data.total === 0) { exactValue = data.value ?? (data.kind === 'object' ? {} : data.kind === 'array' ? [] : null); hasExactValue = true; }
  }
  const leafText = storedValue(exactValue);
  const problem = catalogueError || error;
  const busy = !catalogue && !catalogueError || loading;
  const sourceUrl = provenance && typeof provenance.url === 'string' ? safeSourceUrl(provenance.url) : undefined;
  const handleKey = (event: KeyboardEvent<SVGGElement>, activate: () => void) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activate(); } };

  return <div className="space-y-4 p-4 sm:p-5" aria-label="Source data graph">
    <nav className="flex flex-wrap items-center gap-2 text-xs" aria-label="Source data path">
      <button type="button" onClick={onClose} className="flex items-center gap-1 rounded-md text-sky-200 hover:text-white"><ArrowLeft className="h-3.5 w-3.5" />{scope.ownerName ?? 'Campus connections'}</button>
      {frames.map((item, index) => <span key={index} className="flex min-w-0 items-center gap-2"><ChevronRight className="h-3 w-3 shrink-0 text-slate-500" /><button type="button" aria-current={index === frames.length - 1 ? 'location' : undefined} onClick={() => setFrames(previous => previous.slice(0, index + 1))} className="max-w-52 truncate rounded px-1 py-1 text-neutral-300 hover:bg-white/5 aria-[current=location]:text-white" title={item.label}>{item.kind === 'browse' && !Object.keys(item.filters).length ? catalogue?.find(collection => collection.id === item.collection)?.label ?? item.label : item.label}</button></span>)}
    </nav>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0"><h2 className="break-words text-sm font-semibold text-sky-100">{label}</h2>{!hasExactValue && <p className="mt-1 text-xs leading-5 text-muted-foreground">Select a node with children to expand it. Leaf nodes show their values directly. Lines here show stored records and fields.</p>}</div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {frames.length > 1 && <button type="button" onClick={() => setFrames(previous => previous.slice(0, -1))} className="flex items-center gap-1 rounded-lg border border-white/15 px-2 py-2"><ArrowLeft className="h-3.5 w-3.5" />Back</button>}
        {!busy && !problem && total > 0 && <><span aria-live="polite">{frame.offset + 1}–{Math.min(frame.offset + children.length, total)} of {total.toLocaleString()}</span><button type="button" aria-label="Previous data nodes" disabled={!frame.offset} onClick={() => page(Math.max(0, frame.offset - GRAPH_PAGE_SIZE))} className="rounded-lg border border-white/15 p-2 disabled:opacity-30"><ChevronLeft className="h-3.5 w-3.5" /></button><button type="button" aria-label="Next data nodes" disabled={nextOffset === null} onClick={() => nextOffset !== null && page(nextOffset)} className="rounded-lg border border-white/15 p-2 disabled:opacity-30"><ChevronRight className="h-3.5 w-3.5" /></button></>}
      </div>
    </div>
    {problem ? <div role="alert" className="rounded-xl border border-amber-400/25 bg-amber-400/5 p-4 text-sm text-amber-200"><p>{problem}</p><button type="button" onClick={() => setRetry(value => value + 1)} className="mt-3 rounded border border-white/20 px-3 py-2 text-xs">Retry loading this node</button></div>
      : busy ? <div role="status" className="flex min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading original data…</div>
        : <>
          {diagnostics.length > 0 && <details className="rounded-xl border border-amber-400/25 p-3 text-xs text-amber-200"><summary className="cursor-pointer">{diagnostics.length} link issue{diagnostics.length === 1 ? '' : 's'} — some records could not be resolved</summary><pre className="mt-2 max-h-52 overflow-auto whitespace-pre-wrap break-all">{JSON.stringify(diagnostics, null, 2)}</pre></details>}
          {hasExactValue ? <div
            role="group"
            aria-label="Source data value node"
            className="flex h-[520px] max-h-[65vh] min-h-[360px] items-center justify-center px-3 py-6"
            style={{ backgroundImage: 'radial-gradient(circle, #52606b2e 1px, transparent 1px)', backgroundSize: '24px 24px' }}
          >
            <div className="min-w-[min(220px,100%)] max-w-xl rounded-2xl border border-sky-300 bg-[#0a3048] p-5 text-center shadow-[0_0_0_5px_#7dd3fc0d]" aria-label="Stored field value">
              <h3 className="mb-3 break-words text-xs font-medium text-sky-200">{label}</h3>
              <pre tabIndex={0} className={`max-h-[40vh] overflow-auto whitespace-pre-wrap [overflow-wrap:anywhere] font-sans text-sky-50 ${leafText && leafText.length > 120 ? 'text-left text-sm leading-6' : 'text-xl leading-7'}`}>{leafText}</pre>
            </div>
          </div>
            : children.length ? <>
              <div className="hidden @min-[700px]:block"><svg viewBox="0 0 1120 680" className="h-[520px] max-h-[65vh] min-h-[360px] w-full" role="group" aria-label="Interactive source data map">
                <defs><pattern id={`${marker}-dots`} width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="#52606b" opacity="0.2" /></pattern></defs><rect width="1120" height="680" fill={`url(#${marker}-dots)`} />
                {children.map((child, index) => {
                  const angle = -Math.PI / 2 + index / Math.max(children.length, 3) * 2 * Math.PI;
                  const x = 560 + Math.cos(angle) * 395; const y = 340 + Math.sin(angle) * 250;
                  return <g key={child.id}><line x1="560" y1="340" x2={x} y2={y} stroke="#38bdf8" strokeOpacity="0.35" strokeDasharray="3 5" />{child.activate ? <g role="button" tabIndex={0} aria-label={`${child.label}. ${child.detail}`} onClick={child.activate} onKeyDown={event => child.activate && handleKey(event, child.activate)} className="cursor-pointer"><title>{child.label} — {child.detail}</title><rect x={x - 100} y={y - 38} width="200" height="76" rx="12" fill="#12283b" stroke="#38bdf8" strokeOpacity="0.65" />{nodeLines(child.label).map((line, lineIndex, lines) => <text key={lineIndex} x={x} y={y - (lines.length > 1 ? 13 : 4) + lineIndex * 18} textAnchor="middle" fill="#e0f2fe" fontSize="14" fontWeight="500">{line}</text>)}<text x={x} y={y + 26} textAnchor="middle" fill="#94a3b8" fontSize="10">{child.detail.length > 34 ? `${child.detail.slice(0, 32)}…` : child.detail}</text></g> : <foreignObject x={x - 100} y={y - 55} width="200" height="110"><LeafNode label={child.label} value={child.detail} /></foreignObject>}</g>;
                })}
                <g><title>{label}</title><rect x="450" y="298" width="220" height="84" rx="17" fill="#0a3048" stroke="#7dd3fc" />{nodeLines(label).map((line, index, lines) => <text key={index} x="560" y={335 - (lines.length > 1 ? 9 : 0) + index * 18} textAnchor="middle" fill="#e0f2fe" fontSize="15" fontWeight="600">{line}</text>)}<text x="560" y="365" textAnchor="middle" fill="#94a3b8" fontSize="11">{total.toLocaleString()} {frame.kind === 'browse' ? groupBy ? 'groups' : 'records' : 'children'} · expand to explore</text></g>
              </svg></div>
              <div className="grid gap-2 sm:grid-cols-2 @min-[700px]:hidden" aria-label="Source data nodes">{children.map(child => child.activate ? <button key={child.id} type="button" onClick={child.activate} className="flex min-w-0 items-center gap-3 rounded-xl border border-sky-400/25 bg-sky-950/20 p-3 text-left"><span className="min-w-0 flex-1"><span className="block break-words text-xs font-medium text-sky-100">{child.label}</span><span className="mt-1 block truncate text-[11px] text-muted-foreground">{child.detail}</span></span><ArrowRight className="h-3.5 w-3.5 shrink-0 text-sky-300" /></button> : <LeafNode key={child.id} label={child.label} value={child.detail} />)}</div>
            </> : <p className="rounded-xl border border-white/10 p-5 text-sm text-muted-foreground">No records in this scope. Missing data does not establish closure or unavailability.</p>}
          {artifactProvenance && <div className="space-y-1 rounded-xl border border-white/10 p-3 text-[11px] text-muted-foreground" aria-label="Artifact provenance"><p>Published artifact: {artifactProvenance.artifact_key}</p><p className="break-all font-mono">Path: {JSON.stringify(artifactProvenance.path)}</p><p className="break-all font-mono">Content hash: {artifactProvenance.content_hash}</p><p>Artifact created: {artifactProvenance.created_at} · creation time is not source verification time</p></div>}
          {provenance && <div className="space-y-1 rounded-xl border border-white/10 p-3 text-[11px] text-muted-foreground" aria-label="Record provenance"><p className="break-all font-mono">Original record: {String(provenance.source_record_id ?? provenance.id ?? '')}</p>{provenance.source_key !== undefined && <p className="break-all">Source: {String(provenance.source_key)}</p>}<p>Source collected: {String(provenance.collected_at ?? 'Not recorded')} · capture time is not verification time</p>{provenance.collection === 'faculty' && <p>Profile-listed courses are undated; they do not establish current teaching assignments.</p>}{sourceUrl && <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sky-300 hover:underline">Open original source<ExternalLink className="h-3 w-3" /></a>}</div>}
        </>}
  </div>;
}
