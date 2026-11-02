import type { CampusEntity, KnowledgeIndex } from './knowledge-graph.ts';
import { relationshipLabel } from './knowledge-graph.ts';

/** One original published record: a database row or an item of a release artifact. */
export interface SourceRecord {
  id: string; collection: string; row_id: string;
  source_key: string | null; source_record_key: string | null; source_url: string | null;
  artifact_key?: string | null; artifact_path?: (string | number)[] | null;
  derived_from_source_id?: string | null;
  collected_at: string | null; valid_from: string | null; valid_until: string | null;
  freshness: 'fresh' | 'stale' | 'unknown' | 'static';
  /** Caveats about the whole record; a value's own caveats are on its assertion. */
  limitations: string[];
}
export interface Assertion {
  id: string; value: unknown; source_id: string; field_path: (string | number)[]; limitations: string[];
  publication_status: 'published' | 'not_published' | 'unspecified';
}
export type FactStatus = 'known' | 'unknown' | 'conflicting' | 'multiple';
export type FactCategory = 'contact' | 'academic' | 'links' | 'details';
export interface FactValue {
  id: string; value: unknown; assertion_ids: string[]; supporting_evidence_ids: string[];
  evidence_count: number; valid_from: string | null; valid_until: string | null;
}
export interface ProjectionProperty {
  key: string; label: string; value_type: string; assertions: Assertion[];
  status: FactStatus; category: FactCategory; values: FactValue[];
}
export interface ProjectionRelationship {
  id: string;
  subject: { kind: 'entity'; entity_id: string } | { kind: 'record'; record_id: string };
  predicate: string; target_entity_id: string; direction: 'incoming' | 'outgoing';
  evidence: Record<string, unknown>[];
  registry_locator: { identity_hash: string; entity_id: string; relationship_index: number };
}
export type SectionWindow = 'undated' | 'current' | 'upcoming' | 'ended';
/** One level of a record's place in its group, outermost first. The window compares the
 * published validity dates with the campus date; it never decides which record applies. */
export interface RecordSection { key: string; label: string; level: string; window: SectionWindow | null }
export interface ContextualRecord {
  id: string; label: string; record_type: string; source_id: string; context: ProjectionProperty[];
  properties: ProjectionProperty[]; relationships: ProjectionRelationship[];
  /** Absent from an older Brain, whose records are not grouped. */
  sections?: RecordSection[];
}
export interface RecordGroup {
  key: string; label: string; record_type: string; records: ContextualRecord[];
  total: number; returned: number; next_cursor: string | null;
  filters: Record<string, string | null>; filter_fields: string[]; ordering: string;
  /** How records read: the context field that titles each record, the context fields
   * its sections stand for, and the property shown under each title. */
  title_field?: string | null; section_fields?: string[]; summary_field?: string | null;
}
export interface CoverageIssue { reason: string; collection: string | null; record_id: string | null; fields: string[]; detail: string | null }
export interface EntityProjection {
  schema_version: 3; projection_version: string; dataset_version: string; identity_hash: string;
  entity: CampusEntity & { status?: string | null }; selected_record_group: string | null; properties_complete: boolean;
  properties: ProjectionProperty[]; record_groups: RecordGroup[];
  relationships: ProjectionRelationship[]; sources: SourceRecord[]; coverage: CoverageIssue[];
}

export class ProjectionError extends Error {
  readonly reload: boolean;
  constructor(message: string, reload = false) { super(message); this.reload = reload; }
}
const changed = () => new ProjectionError('The campus release or projection changed. Reload the graph to continue.', true);
export const PROJECTION_PAGE_SIZE = 100;

// Reject incompatible responses before they can become graph nodes. Unknown envelope
// fields are not rendered; source values are traversed only inside declared properties.
function object(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function strings(value: unknown): value is string[] { return Array.isArray(value) && value.every(item => typeof item === 'string'); }
function nullableText(value: unknown) { return value === null || typeof value === 'string'; }
function validProperty(value: unknown): boolean {
  return object(value) && typeof value.key === 'string' && typeof value.label === 'string' && typeof value.value_type === 'string'
    && ['known', 'unknown', 'conflicting', 'multiple'].includes(String(value.status))
    && ['contact', 'academic', 'links', 'details'].includes(String(value.category))
    && Array.isArray(value.values) && value.values.every(v => object(v) && typeof v.id === 'string' && 'value' in v
      && strings(v.assertion_ids) && v.assertion_ids.length > 0 && strings(v.supporting_evidence_ids)
      && Number.isInteger(v.evidence_count) && Number(v.evidence_count) > 0 && nullableText(v.valid_from) && nullableText(v.valid_until))
    && Array.isArray(value.assertions) && value.assertions.every(a => object(a) && typeof a.id === 'string' && 'value' in a
      && ['published', 'not_published', 'unspecified'].includes(String(a.publication_status)) && strings(a.limitations)
      && typeof a.source_id === 'string' && Array.isArray(a.field_path) && a.field_path.length > 0
      && a.field_path.every(s => typeof s === 'string' || Number.isInteger(s)));
}
function validSource(value: unknown): boolean {
  return object(value) && typeof value.id === 'string' && typeof value.collection === 'string' && typeof value.row_id === 'string'
    && nullableText(value.source_key) && nullableText(value.source_record_key) && nullableText(value.source_url)
    && (value.artifact_key === undefined || nullableText(value.artifact_key))
    && (value.artifact_path === undefined || value.artifact_path === null || (Array.isArray(value.artifact_path) && value.artifact_path.every(s => typeof s === 'string' || Number.isInteger(s))))
    && (value.derived_from_source_id === undefined || nullableText(value.derived_from_source_id))
    && nullableText(value.collected_at) && nullableText(value.valid_from) && nullableText(value.valid_until)
    && ['fresh', 'stale', 'unknown', 'static'].includes(String(value.freshness)) && strings(value.limitations);
}
function validSection(value: unknown): boolean {
  return object(value) && typeof value.key === 'string' && typeof value.label === 'string' && typeof value.level === 'string'
    && (value.window === null || ['undated', 'current', 'upcoming', 'ended'].includes(String(value.window)));
}
function validRelationship(value: unknown): boolean {
  return object(value) && typeof value.id === 'string' && typeof value.predicate === 'string' && typeof value.target_entity_id === 'string'
    && ['incoming', 'outgoing'].includes(String(value.direction)) && Array.isArray(value.evidence) && value.evidence.every(object)
    && object(value.subject) && (value.subject.kind === 'entity' ? typeof value.subject.entity_id === 'string' : value.subject.kind === 'record' && typeof value.subject.record_id === 'string')
    && object(value.registry_locator) && typeof value.registry_locator.identity_hash === 'string' && typeof value.registry_locator.entity_id === 'string'
    && Number.isInteger(value.registry_locator.relationship_index);
}
export function parseProjection(value: unknown): EntityProjection {
  if (!object(value) || value.schema_version !== 3 || value.projection_version !== 'entity-facts-1'
    || typeof value.dataset_version !== 'string' || typeof value.identity_hash !== 'string'
    || !object(value.entity) || typeof value.entity.id !== 'string' || typeof value.entity.name !== 'string' || typeof value.entity.kind !== 'string' || !strings(value.entity.aliases)
    || !nullableText(value.selected_record_group) || typeof value.properties_complete !== 'boolean'
    || !Array.isArray(value.properties) || !value.properties.every(validProperty)
    || !Array.isArray(value.relationships) || !value.relationships.every(validRelationship)
    || !Array.isArray(value.sources) || !value.sources.every(validSource)
    || !Array.isArray(value.coverage) || !value.coverage.every(c => object(c) && typeof c.reason === 'string' && nullableText(c.collection) && nullableText(c.record_id) && nullableText(c.detail) && strings(c.fields))
    || !Array.isArray(value.record_groups) || !value.record_groups.every(g => object(g) && typeof g.key === 'string' && typeof g.label === 'string' && typeof g.record_type === 'string'
      && Number.isInteger(g.total) && Number(g.total) >= 0 && Number.isInteger(g.returned) && nullableText(g.next_cursor)
      && object(g.filters) && Object.values(g.filters).every(nullableText) && strings(g.filter_fields) && typeof g.ordering === 'string'
      && (g.title_field === undefined || nullableText(g.title_field)) && (g.section_fields === undefined || strings(g.section_fields))
      && (g.summary_field === undefined || nullableText(g.summary_field))
      && Array.isArray(g.records) && g.returned === g.records.length && g.records.length <= Number(g.total)
      && g.records.every(r => object(r) && typeof r.id === 'string' && typeof r.label === 'string' && typeof r.record_type === 'string' && typeof r.source_id === 'string'
        && Array.isArray(r.context) && r.context.every(validProperty) && Array.isArray(r.properties) && r.properties.every(validProperty)
        && Array.isArray(r.relationships) && r.relationships.every(validRelationship)
        && (r.sections === undefined || (Array.isArray(r.sections) && r.sections.every(validSection)))))) {
    throw new ProjectionError('This projection response is not supported by this Explorer.');
  }
  const parsed = value as unknown as EntityProjection;
  const unique = (ids: string[]) => new Set(ids).size === ids.length;
  if (!unique(parsed.record_groups.map(g => g.key)) || parsed.record_groups.some(g => !unique(g.records.map(r => r.id)))) {
    throw new ProjectionError('Projection contains repeated record or group IDs.');
  }
  // Every value and record must name a source record this response lists, once.
  const sources = parsed.sources.map(source => source.id);
  const listed = new Set(sources);
  const records = parsed.record_groups.flatMap(g => g.records);
  const properties = [...parsed.properties, ...records.flatMap(r => [...r.context, ...r.properties])];
  const referenced = [...records.map(r => r.source_id), ...properties.flatMap(p => p.assertions.map(a => a.source_id)),
    ...parsed.sources.flatMap(source => source.derived_from_source_id ? [source.derived_from_source_id] : [])];
  if (!unique(sources) || referenced.some(id => !listed.has(id))) throw new ProjectionError('Projection values must name a listed source record.');
  for (const property of properties) {
    const assertions = new Map(property.assertions.map(assertion => [assertion.id, assertion]));
    const groupedIds = property.values.flatMap(group => group.assertion_ids);
    if (assertions.size !== property.assertions.length || !unique(property.values.map(group => group.id))
      || !unique(groupedIds) || groupedIds.length !== assertions.size || groupedIds.some(id => !assertions.has(id))) {
      throw new ProjectionError('Fact values must retain every field assertion exactly once.');
    }
    for (const group of property.values) {
      const evidence = new Set(group.assertion_ids.map(id => assertions.get(id)!.source_id));
      if (!unique(group.supporting_evidence_ids) || group.evidence_count !== evidence.size
        || group.supporting_evidence_ids.length !== evidence.size || group.supporting_evidence_ids.some(id => !evidence.has(id) || !listed.has(id))) {
        throw new ProjectionError('Fact evidence records must match their assertions.');
      }
    }
  }
  return parsed;
}

export async function readProjection(graph: KnowledgeIndex, entityId: string, signal: AbortSignal, group?: RecordGroup, fetcher = fetch): Promise<EntityProjection> {
  const params = new URLSearchParams({ entity_id: entityId, dataset_version: graph.dataset_version, identity_hash: graph.identity_hash, limit: String(PROJECTION_PAGE_SIZE) });
  if (group) {
    params.set('record_group', group.key); params.set('filters', JSON.stringify(group.filters));
    if (group.next_cursor) params.set('cursor', group.next_cursor);
  }
  const response = await fetcher(`/api/brain/graph/projection/v3?${params}`, { signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]), cache: 'no-store' });
  if (response.status === 409) throw changed();
  if (!response.ok) throw new ProjectionError(`Projection unavailable (${response.status}).`);
  const result = parseProjection(await response.json());
  if (result.dataset_version !== graph.dataset_version || result.identity_hash !== graph.identity_hash || result.entity.id !== entityId) throw changed();
  if (result.selected_record_group !== (group?.key ?? null)) throw new ProjectionError('Unexpected projection record group.');
  return result;
}

/** Merge a continuation only into its own group, never replace entity assertions or edges. */
export function appendProjectionPage(current: EntityProjection, page: EntityProjection, requested: RecordGroup): EntityProjection {
  if (page.projection_version !== current.projection_version || page.dataset_version !== current.dataset_version || page.identity_hash !== current.identity_hash || page.entity.id !== current.entity.id) throw changed();
  const next = page.record_groups[0];
  const filters = (v: Record<string, string | null>) => JSON.stringify(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)));
  if (page.selected_record_group !== requested.key || page.record_groups.length !== 1 || !next || next.key !== requested.key
    || next.total !== requested.total || next.record_type !== requested.record_type || next.ordering !== requested.ordering || filters(next.filters) !== filters(requested.filters)
    || (next.next_cursor !== null && next.next_cursor === requested.next_cursor)) throw new ProjectionError('The record continuation does not match this group.');
  const ids = new Set(requested.records.map(r => r.id));
  for (const record of next.records) {
    if (ids.has(record.id)) throw new ProjectionError('A record was repeated across projection pages.');
    ids.add(record.id);
  }
  if (ids.size > next.total) throw new ProjectionError('Projection record count exceeds the published total.');
  const known = new Set(current.sources.map(source => source.id));
  return { ...current, record_groups: current.record_groups.map(g => g.key === requested.key ? { ...next, records: [...g.records, ...next.records], returned: g.records.length + next.records.length } : g),
    sources: [...current.sources, ...page.sources.filter(source => !known.has(source.id))],
    coverage: [...current.coverage, ...page.coverage.filter(c => !current.coverage.some(old => JSON.stringify(old) === JSON.stringify(c)))] };
}

/** A value shown in the graph, with the assertion and original record it comes from. */
export interface AttachedValue { value: unknown; assertion: Assertion; source?: SourceRecord }
export interface AttachedFactValue extends FactValue { assertions: AttachedValue[] }
export interface AttachmentNode {
  id: string; label: string; kind: 'entity' | 'group' | 'section' | 'record' | 'property' | 'value' | 'relationship';
  subtitle?: string; values?: AttachedValue[];
  factValues?: AttachedFactValue[]; status?: FactStatus; category?: FactCategory; propertyKey?: string;
  children: AttachmentNode[]; pending?: boolean;
  relationship?: ProjectionRelationship; target?: CampusEntity;
  /** A section's level, such as "Periods", and its window. */
  level?: string; window?: SectionWindow | null;
  /** A record's section labels, outermost first, for reading it outside its section. */
  trail?: string;
}
const nodeId = (...parts: unknown[]) => JSON.stringify(parts);
function entries(value: unknown): [string, unknown][] { return Array.isArray(value) ? value.map((v, i) => [String(i + 1), v]) : object(value) ? Object.entries(value) : []; }
export function valueText(value: unknown): string {
  if (value === null) return 'No value provided';
  if (Array.isArray(value)) return value.length ? `${value.length} items` : 'Empty list';
  if (object(value)) return Object.keys(value).length ? `${Object.keys(value).length} details` : 'Empty object';
  return value === '' ? 'Empty value' : String(value);
}
type Sources = Map<string, SourceRecord>;
function valueNode(id: string, label: string, value: unknown, group: AttachedFactValue, property: ProjectionProperty): AttachmentNode {
  return { id, label, kind: 'value', values: group.assertions, factValues: [{ ...group, value }], status: property.status, category: property.category,
    children: entries(value).map(([key, child]) => valueNode(nodeId(id, key), key, child, group, property)) };
}
function propertyNode(owner: string, property: ProjectionProperty, sources: Sources): AttachmentNode {
  const id = nodeId(owner, 'property', property.key);
  const values = property.assertions.map(assertion => ({ value: assertion.value, assertion, source: sources.get(assertion.source_id) }));
  const assertions = new Map(values.map(attached => [attached.assertion.id, attached]));
  const factValues = property.values.map(group => ({ ...group, assertions: group.assertion_ids.map(assertionId => assertions.get(assertionId)!) }));
  const structured = factValues.some(group => entries(group.value).length > 0);
  return { id, label: property.label, kind: 'property', propertyKey: property.key, status: property.status, category: property.category, values, factValues,
    children: !structured ? [] : factValues.length === 1
      ? valueNode(id, property.label, factValues[0].value, factValues[0], property).children
      : factValues.map((group, i) => valueNode(nodeId(id, group.id), `Value ${i + 1}`, group.value, group, property)) };
}
function relationshipNode(owner: string, rel: ProjectionRelationship, entities: Map<string, CampusEntity>): AttachmentNode {
  const targetId = rel.direction === 'incoming' ? rel.subject.kind === 'entity' ? rel.subject.entity_id : undefined : rel.target_entity_id;
  const target = targetId ? entities.get(targetId) : undefined;
  return { id: nodeId(owner, 'relationship', rel.id), label: target?.name ?? 'Unresolved relationship', kind: 'relationship',
    subtitle: relationshipLabel(rel.predicate, rel.direction === 'incoming'), children: [], relationship: rel, target };
}
/** A record's context on one line: its values, then its validity dates as one window. */
function contextLine(context: ProjectionProperty[]): string {
  const text = (property?: ProjectionProperty) => property?.values.filter(group => group.value !== null && group.value !== '')
    .map(group => valueText(group.value)).join(' / ') || undefined;
  const from = text(context.find(p => p.key === 'valid_from')), until = text(context.find(p => p.key === 'valid_until'));
  const window = from && until ? (from === until ? from : `${from} – ${until}`) : from ? `from ${from}` : until ? `until ${until}` : undefined;
  return [...context.filter(p => p.key !== 'valid_from' && p.key !== 'valid_until').map(text), window].filter(Boolean).join(' · ');
}
const recordCount = (loaded: number, total: number) => `${loaded === total ? '' : `${loaded.toLocaleString()} of `}${total.toLocaleString()} ${total === 1 ? 'record' : 'records'}`;
/** The line under a record's title: the group's summary property when it has a value,
 * otherwise the context that the title and sections do not already show. */
function recordSubtitle(group: RecordGroup, record: ContextualRecord): string | undefined {
  const summary = record.properties.find(p => p.key === group.summary_field)?.values
    .filter(v => v.value !== null && v.value !== '').map(v => valueText(v.value)).join(' / ');
  if (summary) return summary;
  const shown = new Set([group.title_field, ...(group.section_fields ?? [])]);
  return contextLine(record.context.filter(p => !shown.has(p.key))) || undefined;
}
function recordNode(owner: string, group: RecordGroup, record: ContextualRecord, sources: Sources, entities: Map<string, CampusEntity>): AttachmentNode {
  const trail = (record.sections ?? []).map(section => section.label).join(' › ');
  return { id: nodeId(owner, 'record', group.key, record.id), label: record.label, kind: 'record', subtitle: recordSubtitle(group, record), ...(trail ? { trail } : {}),
    children: [...record.context.map(p => propertyNode(nodeId(record.id, 'context'), p, sources)), ...record.properties.map(p => propertyNode(nodeId(record.id, 'properties'), p, sources)), ...record.relationships.map(r => relationshipNode(record.id, r, entities))] };
}
/** Every record at or below a node, in order. */
export function recordsIn(node: AttachmentNode): AttachmentNode[] {
  return node.children.flatMap(child => child.kind === 'record' ? [child] : child.kind === 'section' ? recordsIn(child) : []);
}
/** A group's records under their sections, outermost first, in the order the Brain sent
 * them. Sections only arrange records: each record keeps its own node and provenance. */
function sectioned(owner: string, group: RecordGroup, records: AttachmentNode[]): AttachmentNode[] {
  const top: AttachmentNode[] = [];
  const sections = new Map<string, AttachmentNode>();
  group.records.forEach((record, index) => {
    let siblings = top;
    const path: string[] = [];
    for (const section of record.sections ?? []) {
      path.push(section.key);
      const id = nodeId(owner, 'section', group.key, ...path);
      let node = sections.get(id);
      if (!node) {
        node = { id, label: section.label, kind: 'section', level: section.level, window: section.window, pending: group.next_cursor !== null, children: [] };
        sections.set(id, node);
        siblings.push(node);
      }
      siblings = node.children;
    }
    siblings.push(records[index]);
  });
  for (const node of sections.values()) {
    const count = recordsIn(node).length;
    node.subtitle = [`${count.toLocaleString()} ${count === 1 ? 'record' : 'records'}`, node.window === 'undated' ? null : node.window].filter(Boolean).join(' · ');
  }
  return top;
}
export function projectionTree(projection: EntityProjection, graph: KnowledgeIndex): AttachmentNode {
  const entities = new Map(graph.nodes.map(e => [e.id, e]));
  const sources: Sources = new Map(projection.sources.map(source => [source.id, source]));
  const owner = projection.entity.id;
  return { id: owner, label: projection.entity.name, kind: 'entity', subtitle: projection.entity.kind.replaceAll('_', ' '), children: [
    ...projection.relationships.map(r => relationshipNode(owner, r, entities)),
    ...projection.properties.map(p => propertyNode(owner, p, sources)),
    ...projection.record_groups.map(group => ({ id: nodeId(owner, 'group', group.key), label: group.label, kind: 'group' as const,
      subtitle: recordCount(group.records.length, group.total), pending: group.next_cursor !== null,
      children: sectioned(owner, group, group.records.map(record => recordNode(owner, group, record, sources, entities))),
    })),
  ] };
}
export function findAttachment(root: AttachmentNode, id: string): AttachmentNode | undefined {
  if (root.id === id) return root;
  for (const child of root.children) { const found = findAttachment(child, id); if (found) return found; }
}
export function hasChildren(node: AttachmentNode): boolean { return !!node.target || node.children.length > 0 || !!node.pending; }
