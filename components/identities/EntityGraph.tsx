'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ArrowRight, FileText, X } from 'lucide-react';
import { safeSourceUrl } from '@/lib/identities';
import {
  attachedFields, connections, fieldPreview, type AttachedField, type CampusEntity,
  type EntityProperties, type KnowledgeIndex, type PropertyGroup, type PropertyRecord,
} from '@/lib/knowledge-graph';

type Connection = ReturnType<typeof connections>[number];
type Selection = { kind: 'field'; field: AttachedField } | { kind: 'relationship'; item: Connection };
const control = 'rounded-lg border border-white/15 px-3 py-2 text-xs hover:bg-white/5 disabled:opacity-30';

async function readProperties(graph: KnowledgeIndex, entityId: string, signal: AbortSignal, group?: PropertyGroup) {
  const params = new URLSearchParams({ entity_id: entityId, dataset_version: graph.dataset_version });
  if (group) { params.set('collection', group.collection); params.set('offset', String(group.next_offset)); }
  const response = await fetch(`/api/brain/graph/properties?${params}`, { signal, cache: 'no-store' });
  const result = await response.json();
  if (!response.ok) throw new Error(response.status === 409
    ? 'The campus release changed. Reload the graph to continue.'
    : result.error ?? result.detail ?? 'Could not load attached information.');
  if (result.identity_hash !== graph.identity_hash) throw new Error('Identity links changed. Reload the graph.');
  return result as EntityProperties;
}

export function EntityGraph({ graph, entity, onOpen }: {
  graph: KnowledgeIndex; entity: CampusEntity; onOpen: (node: CampusEntity, via?: string) => void;
}) {
  const [groups, setGroups] = useState<PropertyGroup[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState('');
  const [diagnostics, setDiagnostics] = useState<Record<string, unknown>[]>([]);
  const [retry, setRetry] = useState(0);
  const [selection, setSelection] = useState<Selection>();
  const requests = useRef(new Set<AbortController>());
  const canvas = useRef<HTMLDivElement>(null);
  const marker = useId().replaceAll(':', '');
  const related = useMemo(() => connections(graph, entity.id), [graph, entity.id]);
  const fields = useMemo(() => attachedFields(groups), [groups]);

  useEffect(() => {
    const element = canvas.current;
    if (element) element.scrollLeft = (element.scrollWidth - element.clientWidth) / 2;
  }, []);

  useEffect(() => {
    const active = requests.current;
    return () => { for (const controller of active) controller.abort(); active.clear(); };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    readProperties(graph, entity.id, controller.signal).then(result => {
      if (controller.signal.aborted) return;
      setGroups(result.groups); setDiagnostics(result.diagnostics);
    }).catch(reason => { if (!controller.signal.aborted) setError(reason.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [entity.id, graph, retry]);

  async function more(group: PropertyGroup) {
    const controller = new AbortController(); requests.current.add(controller);
    setPending(group.collection); setError('');
    try {
      const result = await readProperties(graph, entity.id, controller.signal, group);
      if (controller.signal.aborted) return;
      setGroups(previous => previous.map(item => item.collection === group.collection
        ? { ...result.groups[0], records: [...item.records, ...result.groups[0].records] } : item));
      setDiagnostics(previous => [...previous, ...result.diagnostics]);
    } catch (reason) {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Could not load attached information.');
    } finally { requests.current.delete(controller); if (!controller.signal.aborted) setPending(''); }
  }

  // All loaded information stays attached to the entity, including when there are no relationships.
  const nodes = [
    ...related.map(item => ({ kind: 'relationship' as const, key: `relationship:${item.key}`, item })),
    ...fields.map(field => ({ kind: 'field' as const, key: `field:${field.key}`, field })),
    ...groups.filter(group => group.next_offset !== null).map(group => ({ kind: 'more' as const, key: `more:${group.collection}`, group })),
  ];
  const height = Math.max(460, Math.ceil(nodes.length / 2) * 144 + 190);
  const positions = nodes.map((node, index) => ({ ...node, x: index % 2 === 0 ? 30 : 650, y: 200 + Math.floor(index / 2) * 144 }));

  return <section aria-label={`Visual graph for ${entity.name}`} className="space-y-3">
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
      <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-teal-300" />Related entities · {related.length}</span>
      <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-sky-300" />Attached information · {fields.length}</span>
      <span>Select a node to explore</span>
    </div>
    {loading && <p role="status" className="text-xs text-muted-foreground">Loading attached information…</p>}
    {error && <div role="alert" className="flex flex-wrap items-center gap-3 text-xs text-amber-200"><p>{error}</p><button className={control} onClick={() => setRetry(value => value + 1)}>Retry attached information</button></div>}
    <div ref={canvas} role="region" aria-label="Entity graph canvas" tabIndex={0} className="max-h-[75vh] min-h-96 overflow-auto rounded-xl border border-white/10 bg-[#0d171e] outline-offset-2">
      <div className="relative min-w-[1100px]" style={{ height, backgroundImage: 'radial-gradient(circle, #52606b50 1px, transparent 1px)', backgroundSize: '24px 24px' }}>
        <svg aria-hidden="true" width="1100" height={height} className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2">
          <defs><marker id={marker} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#2dd4bf" /></marker></defs>
          {positions.map(node => {
            const endX = node.x === 30 ? 420 : 650;
            const endY = node.y + 52;
            const relationship = node.kind === 'relationship';
            const incoming = relationship && node.item.incoming;
            return <path key={node.key} d={`M 550 145 C 550 ${endY}, 550 ${endY}, ${endX} ${endY}`} fill="none" stroke={relationship ? '#2dd4bf' : '#7dd3fc'} strokeOpacity="0.45" strokeWidth="1.5" strokeDasharray={relationship ? undefined : '4 5'} markerEnd={relationship && !incoming ? `url(#${marker})` : undefined} markerStart={incoming ? `url(#${marker})` : undefined} />;
          })}
        </svg>
        <div className="absolute left-1/2 top-8 z-10 flex min-h-28 w-80 -translate-x-1/2 flex-col items-center justify-center rounded-2xl border border-sky-200 bg-[#0a3048] p-4 text-center shadow-lg">
          <p className="text-[10px] uppercase tracking-wider text-sky-300">{entity.kind.replaceAll('_', ' ')}</p>
          <h2 className="mt-2 text-base font-semibold text-sky-50">{entity.name}</h2>
          {entity.aliases.length > 0 && <p className="mt-2 line-clamp-2 text-[11px] text-sky-200" title={entity.aliases.join(' · ')}>{entity.aliases.join(' · ')}</p>}
        </div>
        {positions.map(node => <div key={node.key} className="absolute w-[390px]" style={{ left: `calc(50% - 550px + ${node.x}px)`, top: node.y }}>
          {node.kind === 'relationship' ? <div className="relative h-[112px] rounded-xl border border-teal-400/60 bg-[#102f30] shadow-md">
            <button className="h-full w-full rounded-xl p-4 pr-12 text-left hover:bg-teal-400/10 focus-visible:outline-2 focus-visible:outline-teal-200" onClick={() => onOpen(node.item.target, node.item.label)}>
              <span className="flex items-center gap-2 text-[11px] text-teal-300">{node.item.label}<ArrowRight size={12} /></span>
              <span className="mt-2 block truncate text-sm font-medium text-teal-50" title={node.item.target.name}>{node.item.target.name}</span>
              <span className="mt-1 block text-[11px] text-teal-200/70">{node.item.target.kind.replaceAll('_', ' ')}</span>
            </button>
            <button aria-label={`Evidence for ${node.item.label}: ${node.item.target.name}`} title="Relationship evidence" className="absolute right-3 top-3 rounded p-1 text-teal-200 hover:bg-white/10" onClick={() => setSelection({ kind: 'relationship', item: node.item })}><FileText size={15} /></button>
          </div> : node.kind === 'field' ? <button onClick={() => setSelection({ kind: 'field', field: node.field })} aria-label={`Open ${node.field.label}`} className="h-[112px] w-full rounded-xl border border-sky-400/40 bg-[#12283b] p-4 text-left shadow-md hover:border-sky-200 focus-visible:outline-2 focus-visible:outline-sky-200">
            <span className="block text-xs font-medium text-sky-200">{node.field.label}</span>
            <span className="mt-2 line-clamp-2 break-words text-sm leading-5 text-sky-50">{fieldPreview(node.field.values[0].value)}</span>
            {node.field.values.length > 1 && <span className="mt-1 block text-[10px] text-sky-300">{node.field.values.length} source values · open to compare</span>}
          </button> : <button disabled={!!pending} onClick={() => more(node.group)} className="h-[112px] w-full rounded-xl border border-dashed border-sky-400/40 bg-[#12283b] p-4 text-left text-xs text-sky-200 hover:border-sky-200 disabled:opacity-50">{pending === node.group.collection ? 'Loading…' : `Load more ${node.group.collection.replaceAll('_', ' ')} information`}<span className="mt-2 block text-muted-foreground">{node.group.records.length} of {node.group.total} sources loaded</span></button>}
        </div>)}
        {!loading && !nodes.length && <p className="absolute top-52 w-full text-center text-sm text-muted-foreground">No linked information is published for this entity yet.</p>}
      </div>
    </div>
    {diagnostics.length > 0 && <details className="text-xs text-amber-200"><summary className="cursor-pointer">Some attached information is unavailable</summary><p className="mt-2">{[...new Set(diagnostics.map(item => String(item.reason)))].join(', ')}</p></details>}
    {selection && <NodeDetail selection={selection} close={() => setSelection(undefined)} />}
  </section>;
}

function NodeDetail({ selection, close }: { selection: Selection; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => { const element = dialog.current!; element.showModal(); return () => element.close(); }, []);
  const title = selection.kind === 'field' ? selection.field.label : `${selection.item.label}: ${selection.item.target.name}`;
  return <dialog ref={dialog} onClose={() => { if (!dialog.current?.open) close(); }} aria-labelledby={titleId} className="fixed inset-0 m-auto max-h-[80vh] w-[min(680px,calc(100%-2rem))] overflow-auto rounded-2xl border border-sky-300/30 bg-[#101e29] p-0 text-slate-100 shadow-2xl backdrop:bg-black/65">
    <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-white/10 bg-[#101e29] p-5"><h3 id={titleId} className="text-base font-semibold capitalize">{title}</h3><button autoFocus aria-label="Close node details" onClick={() => dialog.current?.close()} className="rounded p-2 hover:bg-white/10"><X size={18} /></button></div>
    <div className="space-y-5 p-5">
      {selection.kind === 'field' ? selection.field.values.map(({ value, record, collection }, index) => <article key={`${record.id}:${index}`} className="space-y-4 rounded-xl border border-white/10 p-4">
        <div className="break-words text-sm leading-6"><FieldValue value={value} /></div>
        {record.limitations?.map((text, i) => <p key={i} className="text-xs text-amber-200">{text}</p>)}
        <Source record={record} collection={collection} />
      </article>) : selection.item.edge.evidence.map((ref, index) => <p key={index} className="break-words text-sm leading-6">{ref.source_key} · {ref.source_record_key} · {ref.field}{ref.source_url && <SourceLink url={ref.source_url} />}</p>)}
    </div>
  </dialog>;
}
function Source({ record, collection }: { record: PropertyRecord; collection: string }) {
  return <div className="space-y-2 border-t border-white/10 pt-3 text-xs text-muted-foreground"><p>Source: {record.source_title ?? record.source_key ?? collection}<SourceLink url={record.url ?? ''} /></p><p>{record.title}</p>{record.freshness && <p>Freshness: {record.freshness}</p>}{record.collected_at && <p>Collected: {record.collected_at}</p>}{(record.valid_from || record.valid_until) && <p>Published validity: {record.valid_from ?? 'Not specified'} – {record.valid_until ?? 'Not specified'}</p>}<p className="break-all">Reference: {record.id}</p></div>;
}
function SourceLink({ url }: { url: string }) { const safe = safeSourceUrl(url); return safe ? <a href={safe} target="_blank" rel="noopener noreferrer" className="ml-2 text-sky-300 underline">Source</a> : null; }
function FieldValue({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span className="text-muted-foreground">Not published</span>;
  if (Array.isArray(value)) return value.length ? <ul className="space-y-2">{value.map((item, index) => <li key={index}><FieldValue value={item} /></li>)}</ul> : <span className="text-muted-foreground">None listed</span>;
  if (typeof value === 'object') return <dl className="space-y-2 border-l border-white/15 pl-3">{Object.entries(value).map(([key, item]) => <div key={key}><dt className="text-xs text-muted-foreground">{key.replaceAll('_', ' ')}</dt><dd><FieldValue value={item} /></dd></div>)}</dl>;
  const text = String(value);
  if (/^https?:\/\//.test(text) && safeSourceUrl(text)) return <a href={text} target="_blank" rel="noopener noreferrer" className="break-all text-sky-300 underline">{text}</a>;
  return <span className="whitespace-pre-wrap">{text === '' ? 'Empty value' : text}</span>;
}
