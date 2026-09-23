'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ArrowRight, ChevronDown, FileText, Layers3, Network, Search, X } from 'lucide-react';
import { safeSourceUrl } from '@/lib/identities';
import type { CampusEntity, KnowledgeIndex } from '@/lib/knowledge-graph';
import { canonicalPhonePreview, collectionDescription, detailSections, fieldLabel, nodeSummary, partitionFields, sourceCaveats } from '@/lib/graph-presentation';
import { groupConnections } from '@/lib/graph-connection-groups';
import {
  appendProjectionPage, findAttachment, hasChildren, ProjectionError,
  projectionTree, readProjection, valueText, type AttachedValue, type AttachmentNode, type EntityProjection,
} from '@/lib/graph-projection';

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
    {current && <AttachmentPanel key={current.id} node={current} onSelect={child => child.target ? onOpen(child.target, child.subtitle) : onAttachment(child.id, child.label)} />}
    {projection && !current && <p role="status" className="text-sm text-muted-foreground">{loading ? 'Loading this attachment…' : 'This attachment is unavailable.'} {!loading && <button className={control} onClick={onRoot}>Return to entity</button>}</p>}
    {projection && (!projection.properties_complete || projection.coverage.length > 0) && <details className="text-xs text-amber-200"><summary className="cursor-pointer">Projection coverage</summary><p className="mt-2">{projection.coverage.length ? 'Published values withheld or incomplete in this projection:' : 'This is a partial projection.'}</p><ul className="mt-2 max-h-52 space-y-2 overflow-auto">{projection.coverage.map((issue, index) => <li key={index}>{[issue.collection, issue.record_id, issue.reason, issue.fields.join(', '), issue.detail].filter(Boolean).join(' · ')}</li>)}</ul></details>}
  </div>;
}

function AttachmentPanel({ node, onSelect }: { node: AttachmentNode; onSelect: (node: AttachmentNode) => void }) {
  const [evidence, setEvidence] = useState<AttachmentNode>();
  const fields = partitionFields(node);
  const collections = node.children.filter(child => child.kind === 'group');
  const relationships = node.children.filter(child => child.kind === 'relationship');
  const connectionGroups = groupConnections(relationships);
  const records = node.children.filter(child => child.kind === 'record');
  const caveats = sourceCaveats(node);
  const propertyChildren = node.kind === 'property' || node.kind === 'value';
  const displayFields = propertyChildren ? node.children.filter(child => child.kind === 'value') : fields.details;
  const sections = detailSections(node, displayFields);
  return <section aria-label={`Details for ${node.label}`} className="min-w-0 space-y-6">
    <header className="rounded-2xl border border-sky-300/15 bg-gradient-to-br from-sky-400/[0.08] to-transparent p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-sky-200">
        <Network size={14} aria-hidden="true" />
        <span>{node.kind === 'entity' ? `Graph entity · ${node.subtitle}` : node.kind === 'group' ? 'Record collection' : node.kind === 'record' ? 'Source record' : 'Field details'}</span>
      </div>
      <h2 className="mt-3 break-words text-2xl font-semibold tracking-tight text-slate-100">{node.label}</h2>
      {node.kind !== 'entity' && node.subtitle && <p className="mt-2 break-words text-sm leading-6 text-slate-400">{node.subtitle}</p>}
      {node.kind === 'entity' && <p className="mt-2 text-sm text-slate-400">Details, source records and connections for this entity.</p>}
      {node.kind === 'group' && <p className="mt-2 text-sm leading-6 text-slate-400">{collectionDescription(node)}</p>}
    </header>

    {caveats.length > 0 && <div className="space-y-1 rounded-xl border border-amber-300/20 bg-amber-300/5 px-4 py-3 text-xs leading-5 text-amber-100">{caveats.map(text => <p key={text}>{text}</p>)}</div>}

    {collections.length > 0 && <section aria-label="Record collections" className="space-y-3">
      <SectionLabel label="Explore records" count={collections.length} />
      <div className="grid gap-3 md:grid-cols-2">{collections.map(child => <button key={child.id} aria-label={`Open ${child.label}`} onClick={() => onSelect(child)} className="group min-w-0 rounded-xl border border-sky-300/20 bg-sky-400/5 p-5 text-left transition-colors hover:border-sky-300/50 hover:bg-sky-400/10">
        <span className="flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-sm font-medium text-sky-100"><Layers3 size={16} aria-hidden="true" />{child.label}</span><ArrowRight size={16} className="shrink-0 text-sky-300 transition-transform group-hover:translate-x-1" aria-hidden="true" /></span>
        <span className="mt-3 block text-lg font-semibold tabular-nums text-slate-100">{nodeSummary(child)}</span>
        <span className="mt-1 block text-xs leading-5 text-slate-400">{collectionDescription(child)}</span>
      </button>)}</div>
    </section>}

    {sections.filter(section => section.cards.length > 0).map(section => <section key={section.label} aria-label={section.label} className="space-y-3">
      <SectionLabel label={section.label} count={section.cards.length} />
      <div className="grid items-start gap-3 sm:grid-cols-2 xl:grid-cols-3">{section.cards.map(card => <PropertyCard key={card.field.id} node={card.field} onSelect={onSelect} />)}</div>
    </section>)}

    {relationships.length > 0 && <section aria-label="Entity connections" className="space-y-3">
      <SectionLabel label="Connections" count={relationships.length} />
      <div className="grid items-start gap-3 md:grid-cols-2 xl:grid-cols-3">{connectionGroups.map(group => <section key={group.key} aria-label={`${group.label} connections`} className="min-w-0 overflow-hidden rounded-xl border border-sky-300/20 bg-[#12202c]">
        <h4 className="flex items-center gap-2 border-b border-sky-300/10 px-4 py-3 text-sm font-medium text-sky-200"><Network size={14} className="shrink-0" aria-hidden="true" /><span className="first-letter:uppercase">{group.label}</span><span className="ml-auto rounded-md bg-sky-300/10 px-2 py-0.5 text-xs tabular-nums">{group.nodes.length}</span></h4>
        <ul className="divide-y divide-white/10">{group.nodes.map(child => <li key={child.id} className="px-4 py-3">
          {child.target ? <button aria-label={`Open ${child.label}`} onClick={() => onSelect(child)} className="flex w-full items-start justify-between gap-3 text-left text-sm font-medium text-slate-100 hover:text-sky-200"><span className="break-words">{child.label}</span><ArrowRight size={15} className="mt-0.5 shrink-0" aria-hidden="true" /></button> : <p className="text-sm text-amber-200">{child.label}</p>}
          {child.relationship && <button aria-label={`Evidence for ${child.subtitle}: ${child.label}`} onClick={() => setEvidence(child)} className="mt-2 flex items-center gap-1.5 text-xs text-slate-400 hover:text-sky-200"><FileText size={12} aria-hidden="true" />View evidence</button>}
        </li>)}</ul>
      </section>)}</div>
    </section>}

    {(records.length > 0 || node.kind === 'group') && <RecordList node={node} records={records} onSelect={onSelect} />}

    {!propertyChildren && (fields.empty.length > 0 || fields.sourceFields.length > 0) && <div className="space-y-3 border-t border-white/10 pt-4">
      {fields.empty.length > 0 && <details className="group rounded-xl border border-white/10 bg-black/10">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 text-sm text-slate-400 [&::-webkit-details-marker]:hidden"><span>{fields.empty.length} empty {fields.empty.length === 1 ? 'field' : 'fields'} <span className="text-slate-500">· null or empty values</span></span><ChevronDown size={15} className="shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" /></summary>
        <div className="grid items-start gap-3 border-t border-white/5 p-4 sm:grid-cols-2 xl:grid-cols-3">{fields.empty.map(child => <PropertyCard key={child.id} node={child} onSelect={onSelect} />)}</div>
      </details>}
      {fields.sourceFields.length > 0 && <details className="group rounded-xl border border-white/10 bg-black/10">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 text-sm text-slate-400 [&::-webkit-details-marker]:hidden"><span>Source record fields <span className="text-slate-500">· {fields.sourceFields.length}</span></span><ChevronDown size={15} className="shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" /></summary>
        <p className="border-t border-white/5 px-4 pt-4 text-xs leading-5 text-slate-400">Values repeated in the entity heading, with their evidence.</p>
        <div className="grid items-start gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">{fields.sourceFields.map(child => <PropertyCard key={child.id} node={child} onSelect={onSelect} />)}</div>
      </details>}
    </div>}
    {!node.children.length && <p className="rounded-xl border border-dashed border-white/15 p-6 text-sm text-slate-400">{node.pending ? 'Loading records…' : 'No attached records or details.'}</p>}
    {evidence && <RelationshipEvidence node={evidence} close={() => setEvidence(undefined)} />}
  </section>;
}

function SectionLabel({ label, count }: { label: string; count: number }) {
  return <h3 className="flex items-center gap-2 text-sm font-medium text-slate-200">{label}<span className="rounded-md bg-white/5 px-1.5 py-0.5 text-[11px] tabular-nums text-slate-500">{count.toLocaleString()}</span></h3>;
}

function PropertyCard({ node, onSelect }: { node: AttachmentNode; onSelect: (node: AttachmentNode) => void }) {
  return <div data-node-kind={node.kind} className="min-w-0 rounded-xl border border-white/10 bg-white/[0.02] p-4">
    <p className="text-xs font-medium text-slate-400">{fieldLabel(node)}</p>
    <PropertyValues node={node} />
    {hasChildren(node) && <button aria-label={`Open ${node.label}`} onClick={() => onSelect(node)} className="mt-3 flex items-center gap-1.5 text-xs text-sky-300 hover:text-sky-100">Explore values <ArrowRight size={12} aria-hidden="true" /></button>}
  </div>;
}

function PropertyValues({ node }: { node: AttachmentNode }) {
  const groups = node.factValues ?? [];
  return <div className="mt-2 space-y-3">
    {node.status === 'conflicting' && <p className="text-xs text-amber-200">Conflicting published values</p>}
    {node.status === 'multiple' && <p className="text-xs text-slate-400">Multiple values with different validity periods</p>}
    {node.status === 'unknown' && <p className="text-xs text-slate-400">Not known from available evidence</p>}
    {groups.map((group, index) => {
      return <div key={group.id} className={index ? 'border-t border-white/10 pt-3' : undefined}>
        <ValueContent value={group.value} label={fieldLabel(node)} text={canonicalPhonePreview(node, group.value)} />
        {(group.valid_from || group.valid_until || groups.length > 1) && <p className="mt-1 text-xs leading-5 text-slate-400">Validity: {group.valid_from ?? 'Not specified'} – {group.valid_until ?? 'Not specified'}</p>}
        <ValueWarnings values={group.assertions} />
        <details className="mt-3 text-xs text-slate-400">
          <summary className="w-fit cursor-pointer text-sky-300 hover:text-sky-100">{group.evidence_count} {group.evidence_count === 1 ? 'evidence record' : 'evidence records'}</summary>
          <div className="mt-3 space-y-4">{group.assertions.map((attached, sourceIndex) => <div key={`${attached.assertion.id}:${sourceIndex}`} className={sourceIndex ? 'border-t border-white/10 pt-3' : undefined}>
            {group.assertions.length > 1 && <p className="mb-2 text-xs font-medium text-slate-300">{sourceLabel(attached)}</p>}
            <AssertionSource attached={attached} />
          </div>)}</div>
        </details>
      </div>;
    })}
  </div>;
}

function sourceLabel({ source }: AttachedValue): string {
  if (!source) return 'Source record unavailable';
  return `${source.source_key ?? source.collection} · ${source.collection}`;
}

function ValueWarnings({ values }: { values: AttachedValue[] }) {
  const warnings = new Set(values.flatMap(attached => [
    ...(attached.source?.freshness === 'stale' ? ['A source is stale'] : []),
    ...(!attached.source ? ['A source record is unavailable'] : []),
    ...(attached.assertion.publication_status === 'not_published' ? ['A source does not mark this field as published'] : []),
    ...attached.assertion.limitations,
  ]));
  return <>{[...warnings].map(text => <p key={text} className="mt-2 text-xs leading-5 text-amber-200">{text}</p>)}</>;
}

function displayValue(value: unknown): string {
  if (value === null) return 'No value provided';
  if (value === '') return 'Empty text';
  if (Array.isArray(value) && value.length > 0 && value.every(item => typeof item === 'string' || typeof item === 'number')) return value.join(' · ');
  if (Array.isArray(value) && value.length === 1) return '1 item';
  return valueText(value);
}

function ValueContent({ value, label, text: override }: { value: unknown; label: string; text?: string }) {
  const [expanded, setExpanded] = useState(false);
  const text = override ?? displayValue(value);
  const long = text.length > 350;
  return <>
    <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-100">{long && !expanded ? `${text.slice(0, 280)}…` : text}</p>
    {long && <button aria-label={`${expanded ? 'Collapse' : 'Read full'} ${label}`} aria-expanded={expanded} onClick={() => setExpanded(value => !value)} className="mt-2 text-xs text-sky-300 hover:text-sky-100">{expanded ? 'Show less' : 'Read full value'}</button>}
  </>;
}

function RecordList({ node, records, onSelect }: { node: AttachmentNode; records: AttachmentNode[]; onSelect: (node: AttachmentNode) => void }) {
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(30);
  const needle = query.trim().toLowerCase();
  const matches = records.filter(record => !needle || `${record.label} ${record.subtitle ?? ''}`.toLowerCase().includes(needle));
  return <section aria-label="Collection records" className="space-y-3">
    <label className="flex items-center gap-2 rounded-xl border border-white/15 bg-black/15 px-3 text-slate-400"><Search size={15} aria-hidden="true" /><input aria-label={`Search ${node.label} records`} placeholder="Search records by name, date or details…" value={query} onChange={event => { setQuery(event.target.value); setLimit(30); }} className="min-w-0 flex-1 bg-transparent py-3 text-sm text-slate-100 outline-none" /></label>
    <p role="status" className="text-xs text-slate-400">Showing {Math.min(limit, matches.length).toLocaleString()} of {matches.length.toLocaleString()} {needle ? 'matching loaded records' : 'loaded records'}{node.pending ? ' · More records are loading' : ''}</p>
    <div className="divide-y divide-white/10 overflow-hidden rounded-xl border border-white/10">{matches.slice(0, limit).map(record => <button key={record.id} aria-label={`Open ${record.label}`} onClick={() => onSelect(record)} className="flex w-full min-w-0 items-center justify-between gap-4 p-4 text-left hover:bg-sky-400/5"><span className="min-w-0"><span className="block break-words text-sm font-medium text-slate-100">{record.label}</span><span className="mt-1 block break-words text-xs leading-5 text-slate-400">{record.subtitle}</span></span><ArrowRight size={14} className="shrink-0 text-sky-300" aria-hidden="true" /></button>)}</div>
    {!matches.length && <p className="py-4 text-sm text-slate-400">{node.pending ? 'No matching records loaded yet.' : 'No matching records.'}</p>}
    {matches.length > limit && <button className={control} onClick={() => setLimit(value => value + 30)}>Show 30 more records</button>}
  </section>;
}

function AssertionSource({ attached: { assertion, source } }: { attached: AttachedValue }) {
  const url = source?.source_url ? safeSourceUrl(source.source_url) : undefined;
  return <dl className="space-y-2 border-l border-sky-300/20 pl-3 leading-5 [overflow-wrap:anywhere]">
      <div><dt className="text-slate-500">Raw assertion value</dt><dd><ValueContent value={assertion.value} label="raw assertion value" text={JSON.stringify(assertion.value, null, 2)} /></dd></div>
      {assertion.limitations.map((text, index) => <div key={index} className="text-amber-200"><dt className="sr-only">Field limitation</dt><dd>{text}</dd></div>)}
      <div><dt className="text-slate-500">Field publication</dt><dd>{assertion.publication_status === 'unspecified' ? 'Not specified for this field' : assertion.publication_status.replaceAll('_', ' ')}</dd></div>
      {source ? <>
        <div><dt className="text-slate-500">Source</dt><dd>{source.source_key ?? 'Unknown'} · {source.source_record_key ?? source.row_id}</dd></div>
        <div><dt className="text-slate-500">Original record</dt><dd>{source.collection} / {source.row_id}</dd></div>
        {source.derived_from_source_id && <div><dt className="text-slate-500">Derived from evidence record</dt><dd>{source.derived_from_source_id}</dd></div>}
        <div><dt className="text-slate-500">Field path</dt><dd>{JSON.stringify(assertion.field_path)}</dd></div>
        {source.artifact_key && <div><dt className="text-slate-500">Artifact</dt><dd>{source.artifact_key} · {JSON.stringify(source.artifact_path)}</dd></div>}
        <div><dt className="text-slate-500">Collected</dt><dd>{source.collected_at ?? 'Unknown'} · {source.freshness}</dd></div>
        <div><dt className="text-slate-500">Source validity</dt><dd>{source.valid_from ?? 'Not specified'} – {source.valid_until ?? 'Not specified'}</dd></div>
        {source.limitations.map((text, i) => <div key={i} className="text-amber-200"><dt className="sr-only">Source limitation</dt><dd>{text}</dd></div>)}
        {url && <div><dt className="sr-only">Source link</dt><dd><a href={url} target="_blank" rel="noopener noreferrer" className="text-sky-300 underline underline-offset-2">{source.source_url}</a></dd></div>}
      </> : <div><dt className="sr-only">Source availability</dt><dd>Source record not listed in this response.</dd></div>}
    </dl>;
}
function RelationshipEvidence({ node, close }: { node: AttachmentNode; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => { const el = dialog.current!; el.showModal(); return () => el.close(); }, []);
  // Cleanup queues a native close event. Strict Mode can reopen the dialog
  // before it arrives, so that old event must not clear the selected evidence.
  const handleClose = () => { if (dialog.current?.open === false) close(); };
  const relationship = node.relationship!;
  return <dialog ref={dialog} aria-labelledby={titleId} onClose={handleClose} className="fixed inset-0 m-auto max-h-[80vh] w-[min(680px,calc(100%-2rem))] overflow-auto rounded-2xl border border-sky-300/30 bg-[#101e29] p-5 text-slate-100 shadow-2xl backdrop:bg-black/65"><div className="flex items-center justify-between gap-4"><h3 id={titleId} className="text-base font-semibold">{node.subtitle}: {node.label}</h3><button autoFocus aria-label="Close relationship evidence" className="rounded p-2 hover:bg-white/10" onClick={() => dialog.current?.close()}><X size={18} /></button></div><div className="mt-5 space-y-4 break-words text-xs"><p>Published registry reference: {relationship.registry_locator.identity_hash} / {relationship.registry_locator.entity_id} / relationships[{relationship.registry_locator.relationship_index}]</p>{relationship.evidence.map((ref, i) => <dl key={i} className="space-y-2 rounded border border-white/10 p-3">{Object.entries(ref).map(([key, value]) => <div key={key}><dt className="text-muted-foreground">{key}</dt><dd className="whitespace-pre-wrap break-all">{key === 'source_url' && typeof value === 'string' && safeSourceUrl(value) ? <a href={safeSourceUrl(value)!} target="_blank" rel="noopener noreferrer" className="text-sky-200 underline">{value}</a> : typeof value === 'object' ? JSON.stringify(value) : String(value)}</dd></div>)}</dl>)}</div></dialog>;
}
