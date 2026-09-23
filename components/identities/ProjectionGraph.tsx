'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ArrowRight, FileText, X } from 'lucide-react';
import { safeSourceUrl } from '@/lib/identities';
import type { CampusEntity, KnowledgeIndex } from '@/lib/knowledge-graph';
import {
  appendProjectionPage, findAttachment, hasChildren, ProjectionError,
  projectionTree, readProjection, valueText, type AttachedValue, type AttachmentNode, type EntityProjection,
} from '@/lib/graph-projection';

const branch = 'border-sky-400/60 bg-[#12283b] text-sky-100';
const leaf = 'border-green-400/60 bg-[#123322] text-green-100';
const control = 'rounded-lg border border-white/15 px-3 py-2 text-xs hover:bg-white/5';

export function ProjectionGraph({ graph, entity, attachmentId, onAttachment, onOpen, onRoot }: {
  graph: KnowledgeIndex; entity: CampusEntity; attachmentId?: string;
  onAttachment: (id: string, label: string) => void;
  onOpen: (node: CampusEntity, via?: string) => void; onRoot: () => void;
}) {
  const [projection, setProjection] = useState<EntityProjection>();
  const [error, setError] = useState<ProjectionError>();
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setProjection(undefined); setError(undefined); setLoading(true);
    async function load() {
      try {
        let result = await readProjection(graph, entity.id, controller.signal);
        if (controller.signal.aborted) return;
        setProjection(result);
        const cursors = new Set<string>();
        // Load each page once, sequentially, with exact scope pins. A single continuous
        // group is shown while pages arrive; no pagination controls or name merging.
        for (let group = result.record_groups.find(g => g.next_cursor); group; group = result.record_groups.find(g => g.next_cursor)) {
          const cursor = JSON.stringify([group.key, group.next_cursor]);
          if (cursors.has(cursor)) throw new ProjectionError('The projection repeated a continuation cursor.');
          cursors.add(cursor);
          const page = await readProjection(graph, entity.id, controller.signal, group);
          if (controller.signal.aborted) return;
          result = appendProjectionPage(result, page, group);
          setProjection(result);
        }
      } catch (reason) {
        if (controller.signal.aborted) return;
        setError(reason instanceof ProjectionError ? reason : new ProjectionError(reason instanceof Error ? reason.message : 'Could not load projection.'));
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    return () => controller.abort();
  }, [graph, entity.id, retry]);
  const root = useMemo(() => projection ? projectionTree(projection, graph) : undefined, [projection, graph]);
  const current = root && (attachmentId ? findAttachment(root, attachmentId) : root);

  if (error?.reload) return <p role="alert" className="text-sm text-amber-200">{error.message}</p>;
  if (error && !projection) return <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-amber-200"><p>Could not load {entity.name}. {error.message}</p><button className={control} onClick={() => setRetry(n => n + 1)}>Retry</button></div>;
  return <div className="space-y-3" data-projection-version={projection?.projection_version}>
    {loading && <p role="status" className="text-xs text-muted-foreground">{projection ? `Loading remaining records… ${projection.record_groups.reduce((n, g) => n + g.records.length, 0)} of ${projection.record_groups.reduce((n, g) => n + g.total, 0)}` : 'Loading entity projection…'}</p>}
    {error && <div role="alert" className="flex items-center gap-3 text-xs text-amber-200"><p>Only part of this projection is loaded. {error.message}</p><button className={control} onClick={() => setRetry(n => n + 1)}>Retry projection</button></div>}
    {current && <AttachmentCanvas key={current.id} node={current} onSelect={child => child.target ? onOpen(child.target, child.subtitle) : onAttachment(child.id, child.label)} />}
    {projection && !current && <p role="status" className="text-sm text-muted-foreground">{loading ? 'Loading this attachment…' : 'This attachment is unavailable.'} {!loading && <button className={control} onClick={onRoot}>Return to entity</button>}</p>}
    {projection && (!projection.properties_complete || projection.coverage.length > 0) && <details className="text-xs text-amber-200"><summary className="cursor-pointer">Projection coverage</summary><p className="mt-2">{projection.coverage.length ? 'Published values withheld or incomplete in this projection:' : 'This is a partial projection.'}</p><ul className="mt-2 max-h-52 space-y-2 overflow-auto">{projection.coverage.map((issue, index) => <li key={index}>{[issue.collection, issue.record_id, issue.reason, issue.fields.join(', '), issue.detail].filter(Boolean).join(' · ')}</li>)}</ul></details>}
  </div>;
}

function AttachmentCanvas({ node, onSelect }: { node: AttachmentNode; onSelect: (node: AttachmentNode) => void }) {
  const canvas = useRef<HTMLDivElement>(null);
  const marker = useId().replaceAll(':', '');
  const [evidence, setEvidence] = useState<AttachmentNode>();
  useEffect(() => { const el = canvas.current; if (el) el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2; }, []);
  const height = Math.max(460, Math.ceil(node.children.length / 2) * 160 + 200);
  const positions = node.children.map((child, index) => ({ child, x: index % 2 === 0 ? 30 : 650, y: 210 + Math.floor(index / 2) * 160 }));
  return <section aria-label={`Visual graph for ${node.label}`} className="space-y-3">
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground"><span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-green-300" />No children</span><span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-sky-300" />Has children</span><span>{node.children.length} attachments</span><span>Select a blue node to explore</span></div>
    <div ref={canvas} role="region" aria-label="Entity graph canvas" tabIndex={0} className="max-h-[75vh] min-h-96 overflow-auto rounded-xl border border-white/10 bg-[#0d171e] outline-offset-2">
      <div className="relative min-w-[1100px]" style={{ height, backgroundImage: 'radial-gradient(circle, #52606b50 1px, transparent 1px)', backgroundSize: '24px 24px' }}>
        <svg aria-hidden="true" width="1100" height={height} className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2"><defs><marker id={marker} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#7dd3fc" /></marker></defs>{positions.map(({ child, x, y }) => {
          const incoming = child.relationship?.direction === 'incoming';
          return <path key={child.id} d={`M 550 155 C 550 ${y + 58}, 550 ${y + 58}, ${x === 30 ? 420 : 650} ${y + 58}`} fill="none" stroke={hasChildren(child) ? '#7dd3fc' : '#86efac'} strokeOpacity="0.45" strokeWidth="1.5" strokeDasharray={child.relationship ? undefined : '4 5'} markerEnd={child.relationship && !incoming ? `url(#${marker})` : undefined} markerStart={incoming ? `url(#${marker})` : undefined} />;
        })}</svg>
        <div data-has-children={hasChildren(node)} className={`absolute left-1/2 top-8 z-10 flex h-32 w-80 -translate-x-1/2 flex-col items-center justify-center rounded-2xl border p-4 text-center shadow-lg ${hasChildren(node) ? branch : leaf}`}><p className="text-[10px] uppercase tracking-wider opacity-80">{node.kind === 'entity' ? node.subtitle : node.kind}</p><h2 className="mt-2 line-clamp-2 text-base font-semibold" title={node.label}>{node.label}</h2>{node.kind !== 'entity' && node.subtitle && <p className="mt-2 line-clamp-2 text-[11px] opacity-80" title={node.subtitle}>{node.subtitle}</p>}</div>
        {positions.map(({ child, x, y }) => <div key={child.id} className="absolute w-[390px]" style={{ left: `calc(50% - 550px + ${x}px)`, top: y }}>
          <div data-node-kind={child.kind} data-has-children={hasChildren(child)} className={`relative h-[132px] rounded-xl border shadow-md ${hasChildren(child) ? branch : leaf}`}>
            {hasChildren(child) ? <button aria-label={`Open ${child.label}`} className="h-full w-full rounded-xl p-4 text-left hover:border-sky-200 hover:bg-sky-400/10 focus-visible:outline-2 focus-visible:outline-sky-200" onClick={() => onSelect(child)}><span className={`flex items-start justify-between gap-3 text-sm font-medium ${child.relationship ? 'pr-7' : ''}`}><span className="line-clamp-2" title={child.label}>{child.label}</span><ArrowRight size={13} className="shrink-0" /></span><span className="mt-2 line-clamp-3 break-words text-xs opacity-80" title={child.subtitle}>{child.subtitle ?? (child.values ? child.values.map(v => valueText(v.value)).join(' · ') : `${child.children.length} attachments`)}</span></button>
              : <div role="group" aria-label={`${child.label} leaf`} className="h-full p-4"><p className="text-xs font-medium text-green-200">{child.label}</p><div tabIndex={0} aria-label={`${child.label} value`} className="mt-2 h-[76px] overflow-auto whitespace-pre-wrap break-words text-sm leading-5 outline-offset-2">{child.values?.map((attached, i) => <div key={`${attached.assertion.id}:${i}`} className={i ? 'mt-3 border-t border-green-300/20 pt-3' : ''}><p>{valueText(attached.value)}</p><AssertionSource attached={attached} /></div>)}{!child.values && <p>{child.subtitle ?? 'No published attachments'}</p>}{child.relationship && <p className="mt-2 text-[10px] leading-4">Published relationship reference: {JSON.stringify(child.relationship)}</p>}</div></div>}
            {child.relationship && hasChildren(child) && <button aria-label={`Evidence for ${child.subtitle}: ${child.label}`} title="Relationship evidence" className="absolute right-3 top-3 rounded p-1 text-sky-200 hover:bg-white/10" onClick={() => setEvidence(child)}><FileText size={15} /></button>}
          </div>
        </div>)}
        {!node.children.length && <p className="absolute top-52 w-full text-center text-sm text-muted-foreground">{node.pending ? 'Loading records…' : 'No published attachments.'}</p>}
      </div>
    </div>
    {evidence && <RelationshipEvidence node={evidence} close={() => setEvidence(undefined)} />}
  </section>;
}

// Source details are selectable text within leaves, never graph navigation targets.
function AssertionSource({ attached: { assertion, source } }: { attached: AttachedValue }) {
  const url = source?.source_url ? safeSourceUrl(source.source_url) : undefined;
  return <div className="mt-2 space-y-1 text-[10px] leading-4 text-green-200/70"><p>Publication status: {assertion.publication_status}</p>{assertion.limitations.map((text, i) => <p key={i}>{text}</p>)}
    {source ? <div className="space-y-1"><p>Source: {source.source_key ?? 'Unknown'} · {source.source_record_key ?? source.row_id}</p><p>Record: {source.collection} / {source.row_id} · Field path: {JSON.stringify(assertion.field_path)}</p>{source.artifact_key && <p>Artifact: {source.artifact_key} · Path: {JSON.stringify(source.artifact_path)}</p>}<p>Collected: {source.collected_at ?? 'Unknown'} · Freshness: {source.freshness}</p><p>Published validity: {source.valid_from ?? 'Not specified'} – {source.valid_until ?? 'Not specified'}</p>{source.limitations.map((text, i) => <p key={`source:${i}`}>{text}</p>)}{url && <p><a href={url} target="_blank" rel="noopener noreferrer" className="underline">{source.source_url}</a></p>}</div>
      : <p>Source record not listed in this response.</p>}</div>;
}
function RelationshipEvidence({ node, close }: { node: AttachmentNode; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => { const el = dialog.current!; el.showModal(); return () => el.close(); }, []);
  const relationship = node.relationship!;
  return <dialog ref={dialog} aria-labelledby={titleId} onClose={close} className="fixed inset-0 m-auto max-h-[80vh] w-[min(680px,calc(100%-2rem))] overflow-auto rounded-2xl border border-sky-300/30 bg-[#101e29] p-5 text-slate-100 shadow-2xl backdrop:bg-black/65"><div className="flex items-center justify-between gap-4"><h3 id={titleId} className="text-base font-semibold">{node.subtitle}: {node.label}</h3><button autoFocus aria-label="Close relationship evidence" className="rounded p-2 hover:bg-white/10" onClick={() => dialog.current?.close()}><X size={18} /></button></div><div className="mt-5 space-y-4 break-words text-xs"><p>Published registry reference: {relationship.registry_locator.identity_hash} / {relationship.registry_locator.entity_id} / relationships[{relationship.registry_locator.relationship_index}]</p>{relationship.evidence.map((ref, i) => <dl key={i} className="space-y-2 rounded border border-white/10 p-3">{Object.entries(ref).map(([key, value]) => <div key={key}><dt className="text-muted-foreground">{key}</dt><dd className="whitespace-pre-wrap break-all">{key === 'source_url' && typeof value === 'string' && safeSourceUrl(value) ? <a href={safeSourceUrl(value)!} target="_blank" rel="noopener noreferrer" className="text-sky-200 underline">{value}</a> : typeof value === 'object' ? JSON.stringify(value) : String(value)}</dd></div>)}</dl>)}</div></dialog>;
}
