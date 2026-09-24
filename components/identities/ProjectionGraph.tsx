'use client';

import { Fragment, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowRight, ChevronDown, DoorOpen, ExternalLink, FileText, Folder, Info, Mail, Phone, X } from 'lucide-react';
import { safeSourceUrl } from '@/lib/identities';
import type { CampusEntity, KnowledgeIndex } from '@/lib/knowledge-graph';
import {
  canonicalPhonePreview, collectionDescription, fieldLabel, initials, namedLinks, nodeSummary, overviewFields,
  overviewSources, shortUrl, sourceLabel as collectionLabel, type OverviewFields, type OverviewSource,
} from '@/lib/graph-presentation';
import { groupConnections, type ConnectionGroup } from '@/lib/graph-connection-groups';
import {
  appendProjectionPage, findAttachment, ProjectionError,
  projectionTree, readProjection, valueText, type AttachedValue, type AttachmentNode, type EntityProjection,
} from '@/lib/graph-projection';

const control = 'rounded-lg border border-white/15 px-3 py-2 text-xs hover:bg-white/5';

/** The readable overview, or the cards that open one level of the graph at a time. */
export type GraphLayout = 'overview' | 'cards';

export function ProjectionGraph({ graph, entity, attachmentId, layout, onAttachment, onOpen, onRoot }: {
  graph: KnowledgeIndex; entity: CampusEntity; attachmentId?: string; layout: GraphLayout;
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
  return <div className={`space-y-3 ${layout === 'overview' ? 'mx-auto max-w-6xl' : ''}`} data-projection-version={projection?.projection_version}>
    {loading && <p role="status" className="text-xs text-muted-foreground">{projection ? `Loading remaining records… ${projection.record_groups.reduce((n, g) => n + g.records.length, 0)} of ${projection.record_groups.reduce((n, g) => n + g.total, 0)}` : 'Loading entity projection…'}</p>}
    {error && <div role="alert" className="flex items-center gap-3 text-xs text-amber-200"><p>Only part of this projection is loaded. {error.message}</p><button className={control} onClick={() => setRetry(n => n + 1)}>Retry projection</button></div>}
    {current && (layout === 'overview' && (current.kind === 'entity' || current.kind === 'record')
      ? <EntityOverview key={current.id} node={current} onSelect={child => child.target ? onOpen(child.target, child.subtitle) : onAttachment(child.id, child.label)} />
      : <CardsPanel key={current.id} node={current} onSelect={child => child.target ? onOpen(child.target, child.subtitle) : onAttachment(child.id, child.label)} />)}
    {projection && !current && <p role="status" className="text-sm text-muted-foreground">{loading ? 'Loading this attachment…' : 'This attachment is unavailable.'} {!loading && <button className={control} onClick={onRoot}>Return to entity</button>}</p>}
    {projection && (!projection.properties_complete || projection.coverage.length > 0) && <details className="text-xs text-amber-200"><summary className="cursor-pointer">Projection coverage</summary><p className="mt-2">{projection.coverage.length ? 'Published values withheld or incomplete in this projection:' : 'This is a partial projection.'}</p><ul className="mt-2 max-h-52 space-y-2 overflow-auto">{projection.coverage.map((issue, index) => <li key={index}>{[issue.collection, issue.record_id, issue.reason, issue.fields.join(', '), issue.detail].filter(Boolean).join(' · ')}</li>)}</ul></details>}
  </div>;
}

type Select = (node: AttachmentNode) => void;
const ROOM_PREDICATES = ['office_at', 'located_at'];
// What a field's name already implies, said where the value is read.
const FIELD_NOTES: Record<string, string> = { profile_courses: 'undated list, not current teaching' };
/** The backend's label in sentence case, with URL capitalized. */
const heading = (field: AttachmentNode): string => {
  const label = fieldLabel(field).replace(/\burl\b/i, 'URL').replace(/\bgpa\b/i, 'GPA');
  return label ? label[0].toUpperCase() + label.slice(1) : label;
};

/** An entity or record at a glance: who or what it is, how to reach it, its facts,
 * its connections, and each source once. Evidence opens beside the fact it supports. */
function EntityOverview({ node, onSelect }: { node: AttachmentNode; onSelect: Select }) {
  const [openFact, setOpenFact] = useState<string>();
  const [evidence, setEvidence] = useState<AttachmentNode>();
  const fields = overviewFields(node);
  const relationships = node.children.filter(child => child.kind === 'relationship');
  const connections = groupConnections(relationships);
  const collections = node.children.filter(child => child.kind === 'group');
  const sources = overviewSources(node);
  const room = relationships.find(child => child.target && child.relationship?.direction === 'outgoing'
    && ROOM_PREDICATES.includes(child.relationship.predicate));
  const toggle = (id: string) => setOpenFact(current => (current === id ? undefined : id));
  const openHeader = [...fields.headline, ...fields.contact].find(field => field.id === openFact);
  return <section aria-label={`Overview of ${node.label}`} className="min-w-0 space-y-4">
    <header className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
      <div className="flex items-start gap-4">
        <Avatar name={node.label} photo={fields.photo} />
        <div className="min-w-0 flex-1">
          <h2 className="break-words text-2xl font-semibold tracking-tight text-slate-50">{node.label}</h2>
          {fields.headline.length > 0 && <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm leading-6 text-slate-300">{fields.headline.map((field, index) => <span key={field.id} className="inline-flex items-center gap-1.5">
            {index > 0 && <span aria-hidden="true" className="text-slate-500">·</span>}<FactInline field={field} /><EvidenceCount field={field} open={openFact === field.id} onToggle={() => toggle(field.id)} />
          </span>)}</p>}
          {node.kind === 'record' && node.subtitle && <p className="mt-1 break-words text-sm text-slate-400">{node.subtitle}</p>}
        </div>
        <span className="shrink-0 rounded-md border border-white/10 px-2 py-1 text-[11px] uppercase tracking-wider text-slate-400">{node.kind === 'entity' ? node.subtitle : 'Record'}</span>
      </div>
      {fields.contact.length > 0 && <dl className="mt-5 flex flex-wrap gap-x-10 gap-y-4 border-t border-white/10 pt-4">{fields.contact.map(field => <div key={field.id} className="min-w-0 max-w-full">
        <dt className="flex items-center gap-1.5 text-xs text-slate-400"><FieldIcon field={field} />{heading(field)}</dt>
        <dd className="mt-1 flex min-w-0 items-baseline gap-1.5 text-sm text-slate-100">
          <FactInline field={field} />
          <EvidenceCount field={field} open={openFact === field.id} onToggle={() => toggle(field.id)} />
        </dd>
        {room?.target && ['offices', 'office'].includes(field.propertyKey ?? '') && <dd className="mt-0.5 text-xs"><button onClick={() => onSelect(room)} className="text-left text-sky-300 hover:text-sky-100">in {room.label}</button></dd>}
      </div>)}</dl>}
      {openHeader && <div className="mt-4"><EvidencePanel field={openHeader} /></div>}
    </header>

    <div className={`grid items-start gap-4 ${connections.length ? 'lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]' : ''}`}>
      <div className="min-w-0 space-y-4">
        {collections.length > 0 && <section aria-label="Records" className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
          <h3 className="px-5 pt-4 text-xs font-medium text-slate-400">Records</h3>
          <ul className="mt-2 divide-y divide-white/5">{collections.map(child => <li key={child.id}><button aria-label={`Open ${child.label}`} onClick={() => onSelect(child)} className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left hover:bg-sky-400/5">
            <span className="min-w-0"><span className="block text-sm font-medium text-slate-100">{child.label}</span><span className="mt-0.5 block text-xs text-slate-400">{nodeSummary(child)}</span></span>
            <ArrowRight size={15} className="shrink-0 text-sky-300" aria-hidden="true" />
          </button></li>)}</ul>
        </section>}
        {fields.main.length > 0 && <section aria-label="Details" className="divide-y divide-white/5 rounded-2xl border border-white/10 bg-white/[0.02]">{fields.main.map(field => <div key={field.id} className="px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-medium text-slate-400">{heading(field)}{FIELD_NOTES[field.propertyKey ?? ''] && <span className="font-normal text-slate-500"> · {FIELD_NOTES[field.propertyKey ?? '']}</span>}</p>
            <EvidenceCount field={field} open={openFact === field.id} onToggle={() => toggle(field.id)} />
          </div>
          <div className="mt-1.5"><FactBody field={field} onSelect={onSelect} /></div>
          {openFact === field.id && <div className="mt-3"><EvidencePanel field={field} /></div>}
        </div>)}</section>}
        {!fields.main.length && !collections.length && !fields.contact.length && !fields.headline.length && <p className="rounded-2xl border border-dashed border-white/15 p-6 text-sm text-slate-400">{node.pending ? 'Loading records…' : 'No published details.'}</p>}
      </div>
      {connections.length > 0 && <aside aria-label="Connections" className="space-y-5 rounded-2xl border border-white/10 bg-white/[0.02] p-5">
        {connections.map(group => <ConnectionList key={group.key} group={group} onSelect={onSelect} onEvidence={setEvidence} />)}
      </aside>}
    </div>

    <Footnotes sources={sources} hidden={fields.hidden} />
    {evidence && <RelationshipEvidence node={evidence} close={() => setEvidence(undefined)} />}
  </section>;
}

/** The published photo when there is one; initials if there is none or it fails to load. */
function Avatar({ name, photo, small }: { name: string; photo?: string; small?: boolean }) {
  const [failed, setFailed] = useState(false);
  const size = small ? 'h-10 w-10' : 'h-14 w-14';
  if (photo && !failed) {
    // A direct load from Ramapo's site, which the page's image policy allows;
    // next/image would fetch it through this server instead.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={photo} alt={`Photo of ${name}`} onError={() => setFailed(true)} referrerPolicy="no-referrer"
      className={`${size} shrink-0 rounded-full border border-white/10 object-cover`} />;
  }
  return <div aria-hidden="true" className={`flex ${size} shrink-0 items-center justify-center rounded-full bg-sky-400/15 font-semibold text-sky-200 ${small ? 'text-sm' : 'text-lg'}`}>{initials(name)}</div>;
}

function FieldIcon({ field }: { field: AttachmentNode }) {
  const key = field.propertyKey ?? '';
  const Icon = key === 'email' ? Mail : ['phones', 'phone'].includes(key) ? Phone : ['offices', 'office'].includes(key) ? DoorOpen
    : field.category === 'links' ? ExternalLink : Info;
  return <Icon size={13} className="shrink-0" aria-hidden="true" />;
}

/** One value as text: canonical phones, lists joined, links shortened beside their full URL. */
function valueLine(field: AttachmentNode, value: unknown): string {
  return canonicalPhonePreview(field, value) ?? displayValue(value);
}
function factText(field: AttachmentNode): string {
  return (field.factValues ?? []).map(group => valueLine(field, group.value)).join(' / ');
}

function FactInline({ field }: { field: AttachmentNode }) {
  const groups = field.factValues ?? [];
  return <span className="inline-flex min-w-0 flex-wrap items-baseline gap-x-1.5">
    {groups.map((group, index) => {
      const url = typeof group.value === 'string' ? safeSourceUrl(group.value) : undefined;
      return <span key={group.id} className="min-w-0 break-words">
        {index > 0 && <span aria-hidden="true" className="text-slate-600">/ </span>}
        {field.propertyKey === 'email' && typeof group.value === 'string'
          ? <a href={`mailto:${group.value}`} className="text-sky-300 hover:text-sky-100">{group.value}</a>
          : url && field.category === 'links'
            ? <a href={url} target="_blank" rel="noopener noreferrer" title={url} className="block max-w-[22rem] truncate text-sky-300 hover:text-sky-100">{field.propertyKey === 'image_url' ? 'Open photo' : shortUrl(url)}</a>
            : <span className="whitespace-pre-line">{valueLine(field, group.value)}</span>}
      </span>;
    })}
    {field.status === 'conflicting' && <span className="rounded bg-amber-300/10 px-1.5 text-[11px] text-amber-200">sources differ</span>}
  </span>;
}

const CHIP_LENGTH = 64;
function FactBody({ field, onSelect }: { field: AttachmentNode; onSelect: Select }) {
  const [expanded, setExpanded] = useState(false);
  const groups = field.factValues ?? [];
  return <div className="space-y-3">
    {groups.map((group, index) => {
      const value = group.value;
      const list = isTextList(value) ? (value as unknown[]).map(String) : undefined;
      const phones = canonicalPhonePreview(field, value);
      return <div key={group.id} className={index ? 'border-t border-white/5 pt-3' : undefined}>
        {groups.length > 1 && <p className="mb-1 text-xs text-slate-500">{group.assertions.map(attached => attached.source ? collectionLabel(attached.source.collection) : 'Source unavailable').join(', ')}{(group.valid_from || group.valid_until) && ` · ${group.valid_from ?? '…'} – ${group.valid_until ?? '…'}`}</p>}
        {namedLinks(value) ? <ul className="space-y-1 text-sm">{namedLinks(value)!.map((link, i) => { const url = safeSourceUrl(link.url); return <li key={i}>{url ? <a href={url} target="_blank" rel="noopener noreferrer" className="text-sky-300 hover:text-sky-100">{link.name}</a> : link.name}</li>; })}</ul>
          : phones !== undefined ? <p className="whitespace-pre-line text-sm text-slate-100">{phones}</p>
          : list && list.every(item => item.length <= CHIP_LENGTH) ? <ul className="flex flex-wrap gap-1.5">{(expanded ? list : list.slice(0, 12)).map((item, i) => <li key={i} className="rounded-md bg-white/[0.06] px-2 py-0.5 text-sm text-slate-100">{item}</li>)}{list.length > 12 && <li><button onClick={() => setExpanded(v => !v)} className="px-1 text-sm text-sky-300 hover:text-sky-100">{expanded ? 'Show fewer' : `+${list.length - 12}`}</button></li>}</ul>
          : list ? <LongList items={list} />
          : <ValueContent value={value} label={fieldLabel(field)} />}
      </div>;
    })}
    {opensValues(field) && <button aria-label={`Open ${field.label}`} onClick={() => onSelect(field)} className="flex items-center gap-1.5 text-xs text-sky-300 hover:text-sky-100">Explore values <ArrowRight size={12} aria-hidden="true" /></button>}
    {fieldWarnings(field).map(text => <p key={text} className="text-xs leading-5 text-amber-200">{text}</p>)}
  </div>;
}

const isTextList = (value: unknown): boolean => Array.isArray(value) && value.every(item => typeof item === 'string' || typeof item === 'number');
/** A structured fact with no one-line reading, browsed a level down instead. */
const opensValues = (field: AttachmentNode): boolean => field.children.length > 0
  && (field.factValues ?? []).some(group => !isTextList(group.value) && !namedLinks(group.value))
  && canonicalPhonePreview(field, field.factValues?.[0]?.value) === undefined;

/** Long entries, such as publications: a few at a time, each kept whole. */
function LongList({ items }: { items: string[] }) {
  const [expanded, setExpanded] = useState(false);
  const preview = items.some(item => item.length > 120) ? 2 : 3;
  return <>
    <ul className="space-y-2 text-sm leading-6 text-slate-100">{(expanded ? items : items.slice(0, preview)).map((item, i) => <li key={i} className="break-words">{item}</li>)}</ul>
    {items.length > preview && <button onClick={() => setExpanded(value => !value)} className="mt-1 text-xs text-sky-300 hover:text-sky-100">{expanded ? 'Show fewer' : `Show all ${items.length}`}</button>}
  </>;
}

/** A field's own caveats; a stale or derived source is said once, under Sources. */
function fieldWarnings(field: AttachmentNode): string[] {
  const warnings = new Set<string>();
  if (field.status === 'multiple') warnings.add('Several values apply in different periods.');
  for (const { assertion, source } of field.values ?? []) {
    if (!source) warnings.add('A source record is unavailable.');
    if (assertion.publication_status === 'not_published') warnings.add('A source does not mark this field as published.');
    for (const text of assertion.limitations) warnings.add(text);
  }
  return [...warnings];
}

const evidenceTotal = (field: AttachmentNode): number =>
  (field.factValues ?? []).reduce((total, group) => total + group.evidence_count, 0) || (field.values ?? []).length;
function EvidenceCount({ field, open, onToggle }: { field: AttachmentNode; open: boolean; onToggle: () => void }) {
  const count = evidenceTotal(field);
  return <button type="button" aria-expanded={open} aria-label={`${count} ${count === 1 ? 'source' : 'sources'} for ${fieldLabel(field)}`} title="Show evidence" onClick={onToggle}
    className={`inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full border px-1.5 text-[10px] tabular-nums ${open ? 'border-sky-300/60 text-sky-200' : 'border-white/15 text-slate-400 hover:border-sky-300/50 hover:text-sky-200'}`}>{count}</button>;
}

function EvidencePanel({ field }: { field: AttachmentNode }) {
  const attached = (field.factValues ?? []).flatMap(group => group.assertions);
  return <div className="rounded-xl border border-sky-300/15 bg-sky-400/[0.04] p-4 text-xs text-slate-300">
    <p className="mb-3 font-medium text-slate-200">Evidence for {fieldLabel(field)}</p>
    <div className="space-y-4">{attached.map((value, index) => <div key={`${value.assertion.id}:${index}`} className={index ? 'border-t border-white/10 pt-3' : undefined}>
      <p className="mb-2 text-slate-400">{value.source ? collectionLabel(value.source.collection) : 'Source unavailable'}</p>
      <AssertionSource attached={value} />
    </div>)}</div>
  </div>;
}

const PREVIEW = 5;
function ConnectionList({ group, onSelect, onEvidence }: { group: ConnectionGroup; onSelect: Select; onEvidence: (node: AttachmentNode) => void }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? group.nodes : group.nodes.slice(0, PREVIEW);
  return <section aria-label={`${group.label} connections`}>
    <h3 className="flex items-center justify-between gap-2 text-xs font-medium text-slate-400"><span className="first-letter:uppercase">{group.label}</span><span className="tabular-nums text-slate-500">{group.nodes.length}</span></h3>
    <ul className="mt-2">{visible.map(child => <li key={child.id} className="group -mx-2 flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-white/[0.04]">
      {child.target ? <button aria-label={`Open ${child.label}`} onClick={() => onSelect(child)} title={child.label} className="min-w-0 flex-1 truncate text-left text-sm text-sky-200 hover:text-sky-100">{child.label}</button>
        : <span className="text-sm text-amber-200">{child.label}</span>}
      {child.relationship && <button aria-label={`Evidence for ${child.subtitle}: ${child.label}`} title="Relationship evidence" onClick={() => onEvidence(child)} className="shrink-0 rounded p-1 text-slate-500 opacity-60 hover:text-sky-200 focus-visible:opacity-100 group-hover:opacity-100"><FileText size={13} aria-hidden="true" /></button>}
    </li>)}</ul>
    {group.nodes.length > PREVIEW && <button onClick={() => setExpanded(value => !value)} className="mt-1 text-xs text-slate-400 hover:text-sky-200">{expanded ? 'Show fewer' : `+${group.nodes.length - PREVIEW} more`}</button>}
  </section>;
}

const FRESHNESS: Record<string, string> = { fresh: 'text-emerald-300', stale: 'text-amber-200', unknown: 'text-slate-400', static: 'text-slate-400' };
function SourceLine({ summary: { source, label, derivedFrom } }: { summary: OverviewSource }) {
  const url = source.source_url ? safeSourceUrl(source.source_url) : undefined;
  return <li className="text-sm">
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <span className="text-slate-100">{label}</span>
      {derivedFrom && <span className="text-xs text-slate-400">derived from the {derivedFrom.toLowerCase()}</span>}
      <span className={`text-xs ${FRESHNESS[source.freshness] ?? 'text-slate-400'}`}>{source.freshness}</span>
      {source.collected_at && <span className="text-xs text-slate-500">collected {source.collected_at.slice(0, 10)}</span>}
      {url && <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-sky-300 hover:text-sky-100">{shortUrl(url)}</a>}
    </div>
    {source.limitations.map(text => <p key={text} className="mt-1 text-xs leading-5 text-slate-400">{text}</p>)}
  </li>;
}

/** Under a page: each source once, then the fields not shown, each with its reason and evidence. */
function Footnotes({ sources, hidden }: { sources: OverviewSource[]; hidden: OverviewFields['hidden'] }) {
  const [openFact, setOpenFact] = useState<string>();
  if (!sources.length && !hidden.length) return null;
  return <footer className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.02] px-5 py-4">
    {sources.length > 0 && <section aria-label="Sources">
      <h3 className="text-xs font-medium text-slate-400">Sources</h3>
      <ul className="mt-2 space-y-3">{sources.map(summary => <SourceLine key={summary.source.id} summary={summary} />)}</ul>
    </section>}
    {hidden.length > 0 && <details className={`group ${sources.length ? 'border-t border-white/10 pt-3' : ''}`}>
      <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 [&::-webkit-details-marker]:hidden">{hidden.length} {hidden.length === 1 ? 'field' : 'fields'} not shown<ChevronDown size={14} className="transition-transform group-open:rotate-180" aria-hidden="true" /></summary>
      <ul className="mt-3 divide-y divide-white/5 overflow-hidden rounded-xl border border-white/10">{hidden.map(({ field, reason }) => <li key={field.id} className="px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm text-slate-200">{heading(field)}</span>
          <span className="flex items-center gap-2 text-xs text-slate-500">{reason}<EvidenceCount field={field} open={openFact === field.id} onToggle={() => setOpenFact(current => current === field.id ? undefined : field.id)} /></span>
        </div>
        {reason !== 'Not published' && <p className="mt-1 break-words text-xs text-slate-400">{factText(field)}</p>}
        {fieldWarnings(field).map(text => <p key={text} className="mt-1 text-xs leading-5 text-amber-200/80">{text}</p>)}
        {openFact === field.id && <div className="mt-3"><EvidencePanel field={field} /></div>}
      </li>)}</ul>
    </details>}
  </footer>;
}

const CARD = 'min-w-0 rounded-xl border border-white/15 p-4 text-left';
const CARD_GRID = 'grid grid-flow-row-dense gap-3 sm:grid-cols-2 lg:grid-cols-3';
const CONNECTION_PREVIEW = 6;
const RECORD_PAGE = 30;

/** One level of the graph as cards, like the category pages: a card with an arrow
 * opens the next level down, and a fact card shows its value and opens its evidence in place. */
function CardsPanel({ node, onSelect }: { node: AttachmentNode; onSelect: Select }) {
  const [evidence, setEvidence] = useState<AttachmentNode>();
  const value = node.kind === 'property' || node.kind === 'value';
  const fields = node.kind === 'entity' || node.kind === 'record' ? overviewFields(node) : undefined;
  const facts = fields ? [...fields.headline, ...fields.contact, ...fields.main] : node.children.filter(child => child.kind === 'property' || child.kind === 'value');
  const collections = node.children.filter(child => child.kind === 'group');
  const connections = groupConnections(node.children.filter(child => child.kind === 'relationship'));
  const summary = node.kind === 'group' ? [nodeSummary(node), collectionDescription(node)].filter(Boolean).join(' · ') : value ? nodeSummary(node) : node.subtitle;
  return <section aria-label={`Details for ${node.label}`} className="min-w-0 space-y-6">
    <header className="flex items-center gap-3">
      {fields?.photo && <Avatar name={node.label} photo={fields.photo} small />}
      <div className="min-w-0">
        <h2 className="break-words text-lg font-semibold text-slate-50">{value ? heading(node) : node.label}</h2>
        {summary && <p className="mt-0.5 break-words text-xs text-slate-400">{summary}</p>}
      </div>
    </header>
    {collections.length > 0 && <CardSection label="Records" count={collections.length}>
      {collections.map(group => <OpenCard key={group.id} title={group.label} subtitle={nodeSummary(group)} folder onClick={() => onSelect(group)} />)}
    </CardSection>}
    {node.kind === 'group' && <RecordCards node={node} onSelect={onSelect} />}
    {facts.length > 0 && <CardSection label={value ? 'Values' : 'Facts'} count={facts.length}>
      <FactCards facts={facts} evidence={!value} onSelect={onSelect} />
    </CardSection>}
    {connections.map(group => <ConnectionCards key={group.key} group={group} onSelect={onSelect} onEvidence={setEvidence} />)}
    {value && <EvidencePanel field={node} />}
    {node.kind !== 'group' && !facts.length && !collections.length && !connections.length && <p className="rounded-xl border border-dashed border-white/15 p-6 text-sm text-slate-400">{node.pending ? 'Loading records…' : 'No published details.'}</p>}
    {fields && <Footnotes sources={overviewSources(node)} hidden={fields.hidden} />}
    {evidence && <RelationshipEvidence node={evidence} close={() => setEvidence(undefined)} />}
  </section>;
}

function CardSection({ label, count, after, children }: { label: string; count: number; after?: ReactNode; children: ReactNode }) {
  return <section aria-label={label} className="space-y-2">
    <h3 className="flex items-center gap-2 text-xs font-medium text-slate-400"><span className="first-letter:uppercase">{label}</span><span className="tabular-nums text-slate-500">{count.toLocaleString()}</span></h3>
    <div className={CARD_GRID}>{children}</div>
    {after}
  </section>;
}

/** A card that opens the next level: a record collection, a record or a structured value. */
function OpenCard({ title, subtitle, folder, onClick }: { title: string; subtitle?: string; folder?: boolean; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`${CARD} flex items-center justify-between gap-3 hover:border-sky-300/70 hover:bg-sky-400/5`}>
    <span className="flex min-w-0 items-center gap-3">
      {folder && <Folder size={16} className="shrink-0 text-sky-300" aria-hidden="true" />}
      <span className="min-w-0"><span title={title} className="block truncate text-sm text-sky-100">{title}</span>{subtitle && <span title={subtitle} className="mt-1 block truncate text-xs text-muted-foreground">{subtitle}</span>}</span>
    </span>
    <ArrowRight size={14} className="shrink-0 text-sky-300" aria-hidden="true" />
  </button>;
}

/** Facts as cards. A structured value opens a level down; any other fact opens its full
 * value and evidence below its row, so the evidence stays beside the fact it supports. */
function FactCards({ facts, evidence, onSelect }: { facts: AttachmentNode[]; evidence: boolean; onSelect: Select }) {
  const [open, setOpen] = useState<string>();
  return <>{facts.map(field => opensValues(field)
    ? <OpenCard key={field.id} title={heading(field)} subtitle={nodeSummary(field)} onClick={() => onSelect(field)} />
    : <Fragment key={field.id}>
      <FactCard field={field} evidence={evidence} open={open === field.id} onToggle={() => setOpen(current => current === field.id ? undefined : field.id)} />
      {open === field.id && <FactDetail field={field} evidence={evidence} onSelect={onSelect} onClose={() => setOpen(undefined)} />}
    </Fragment>)}</>;
}

/** A single published URL on a links fact, or an email address, shown as a link. */
function factLink(field: AttachmentNode): { href: string; text: string } | undefined {
  const value = field.factValues?.length === 1 ? field.factValues[0].value : undefined;
  if (typeof value !== 'string') return;
  if (field.propertyKey === 'email') return { href: `mailto:${value}`, text: value };
  const url = field.category === 'links' ? safeSourceUrl(value) : undefined;
  return url ? { href: url, text: url } : undefined;
}

function FactCard({ field, evidence, open, onToggle }: { field: AttachmentNode; evidence: boolean; open: boolean; onToggle: () => void }) {
  const count = evidenceTotal(field);
  const link = factLink(field);
  const note = FIELD_NOTES[field.propertyKey ?? ''];
  return <button type="button" aria-expanded={open} onClick={onToggle} className={`${CARD} flex flex-col ${open ? 'border-sky-300/60 bg-sky-400/[0.06]' : 'hover:border-white/30 hover:bg-white/[0.03]'}`}>
    <span className="flex items-start justify-between gap-2">
      <span className="min-w-0 truncate text-xs text-muted-foreground">{heading(field)}</span>
      {evidence && <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full border border-white/15 px-1.5 text-[10px] tabular-nums text-slate-400">{count}<span className="sr-only"> {count === 1 ? 'source' : 'sources'}</span></span>}
    </span>
    <span className="mt-1 line-clamp-2 break-words text-sm text-slate-100">{link?.href.startsWith('http') ? shortUrl(link.text) : factText(field).replace(/\s*\n\s*/g, ' · ')}</span>
    {field.status === 'conflicting' && <span className="mt-1 block text-[11px] text-amber-200">Sources differ</span>}
    {field.status === 'multiple' && <span className="mt-1 block text-[11px] text-slate-400">Several values by period</span>}
    {note && <span className="mt-1 block text-[11px] text-slate-500">{note}</span>}
  </button>;
}

function FactDetail({ field, evidence, onSelect, onClose }: { field: AttachmentNode; evidence: boolean; onSelect: Select; onClose: () => void }) {
  const link = factLink(field);
  return <div className="col-span-full space-y-3 rounded-xl border border-white/15 bg-white/[0.02] p-4">
    <div className="flex items-start justify-between gap-3">
      <p className="text-xs font-medium text-slate-300">{heading(field)}</p>
      <button type="button" aria-label={`Close ${heading(field)}`} onClick={onClose} className="-m-1 rounded p-1 text-slate-400 hover:bg-white/10 hover:text-slate-100"><X size={14} aria-hidden="true" /></button>
    </div>
    {link ? <>
      <a href={link.href} target={link.href.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer" className="block break-all text-sm text-sky-300 hover:text-sky-100">{link.text}</a>
      {fieldWarnings(field).map(text => <p key={text} className="text-xs leading-5 text-amber-200">{text}</p>)}
    </> : <FactBody field={field} onSelect={onSelect} />}
    {evidence && <EvidencePanel field={field} />}
  </div>;
}

function ConnectionCards({ group, onSelect, onEvidence }: { group: ConnectionGroup; onSelect: Select; onEvidence: (node: AttachmentNode) => void }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? group.nodes : group.nodes.slice(0, CONNECTION_PREVIEW);
  return <CardSection label={group.label} count={group.nodes.length} after={group.nodes.length > CONNECTION_PREVIEW
    && <button onClick={() => setExpanded(value => !value)} className="text-xs text-sky-300 hover:text-sky-100">{expanded ? 'Show fewer' : `Show ${group.nodes.length - CONNECTION_PREVIEW} more`}</button>}>
    {visible.map(child => <div key={child.id} className={`group flex min-w-0 items-center rounded-xl border border-white/15 ${child.target ? 'hover:border-sky-300/70 hover:bg-sky-400/5' : ''}`}>
      {child.target ? <button type="button" onClick={() => onSelect(child)} className="flex min-w-0 flex-1 items-center justify-between gap-3 p-4 text-left">
        <span className="min-w-0"><span title={child.label} className="block truncate text-sm text-sky-100">{child.label}</span><span className="mt-1 block truncate text-xs text-muted-foreground">{child.target.kind.replaceAll('_', ' ')}</span></span>
        <ArrowRight size={14} className="shrink-0 text-sky-300" aria-hidden="true" />
      </button> : <p className="min-w-0 flex-1 p-4 text-sm text-amber-200">{child.label}</p>}
      {child.relationship && <button type="button" aria-label={`Evidence for ${child.subtitle}: ${child.label}`} title="Relationship evidence" onClick={() => onEvidence(child)}
        className="mr-2 shrink-0 rounded p-1.5 text-slate-500 opacity-60 hover:text-sky-200 focus-visible:opacity-100 group-hover:opacity-100"><FileText size={13} aria-hidden="true" /></button>}
    </div>)}
  </CardSection>;
}

/** A collection's records as cards, filtered like a category page. */
function RecordCards({ node, onSelect }: { node: AttachmentNode; onSelect: Select }) {
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(RECORD_PAGE);
  const records = node.children.filter(child => child.kind === 'record');
  const needle = query.trim().toLowerCase();
  const matches = records.filter(record => !needle || `${record.label} ${record.subtitle ?? ''}`.toLowerCase().includes(needle));
  return <section aria-label="Collection records" className="space-y-3">
    <input aria-label={`Filter ${node.label}`} value={query} onChange={event => { setQuery(event.target.value); setLimit(RECORD_PAGE); }} placeholder={`Find in ${node.label.toLowerCase()}…`} className="w-full rounded-lg border border-white/15 bg-black/20 p-3 text-sm" />
    <div className={CARD_GRID}>{matches.slice(0, limit).map(record => <OpenCard key={record.id} title={record.label} subtitle={record.subtitle} onClick={() => onSelect(record)} />)}</div>
    <p role="status" className="text-xs text-muted-foreground">{matches.length.toLocaleString()} {needle ? 'matching ' : ''}{matches.length === 1 ? 'record' : 'records'}{node.pending ? ' loaded so far' : ''}</p>
    {matches.length > limit && <button className={control} onClick={() => setLimit(value => value + RECORD_PAGE)}>Show {Math.min(RECORD_PAGE, matches.length - limit)} more</button>}
  </section>;
}

function displayValue(value: unknown): string {
  if (value === null) return 'No value provided';
  const links = namedLinks(value);
  if (links) return links.map(link => link.name).join(' · ');
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
