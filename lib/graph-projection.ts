import type { CampusEntity, KnowledgeIndex } from './knowledge-graph.ts';
import { relationshipLabel } from './knowledge-graph.ts';

export interface Provenance {
  source_key: string; source_record_key: string; source_url: string | null;
  locator: { kind: 'row'; collection: string; row_id: string; field_path: (string | number)[] };
  collected_at: string | null; valid_from: string | null; valid_until: string | null;
  freshness: 'fresh' | 'stale' | 'unknown' | 'static';
}
export interface Assertion {
  id: string; value: unknown; provenance: Provenance[]; limitations: string[];
  publication_status: 'published' | 'not_published' | 'unspecified';
}
export interface ProjectionProperty { key: string; label: string; value_type: string; assertions: Assertion[] }
export interface ProjectionRelationship {
  id: string;
  subject: { kind: 'entity'; entity_id: string } | { kind: 'record'; record_id: string };
  predicate: string; target_entity_id: string; direction: 'incoming' | 'outgoing';
  evidence: Record<string, unknown>[];
  registry_locator: { identity_hash: string; entity_id: string; relationship_index: number };
}
export interface ContextualRecord {
  id: string; label: string; record_type: string; context: ProjectionProperty[];
  properties: ProjectionProperty[]; relationships: ProjectionRelationship[];
}
export interface RecordGroup {
  key: string; label: string; record_type: string; records: ContextualRecord[];
  total: number; returned: number; next_cursor: string | null;
  filters: Record<string, string | null>; filter_fields: string[]; ordering: string;
}
export interface CoverageIssue { reason: string; collection: string | null; record_id: string | null; fields: string[]; detail: string | null }
export interface EntityProjection {
  schema_version: 1; projection_version: string; dataset_version: string; identity_hash: string;
  entity: CampusEntity; selected_record_group: string | null; properties_complete: boolean;
  properties: ProjectionProperty[]; record_groups: RecordGroup[];
  relationships: ProjectionRelationship[]; coverage: CoverageIssue[];
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
    && Array.isArray(value.assertions) && value.assertions.every(a => object(a) && typeof a.id === 'string' && 'value' in a
      && ['published', 'not_published', 'unspecified'].includes(String(a.publication_status)) && strings(a.limitations)
      && Array.isArray(a.provenance) && a.provenance.every(p => object(p) && typeof p.source_key === 'string' && typeof p.source_record_key === 'string'
        && nullableText(p.source_url) && nullableText(p.collected_at) && nullableText(p.valid_from) && nullableText(p.valid_until)
        && ['fresh', 'stale', 'unknown', 'static'].includes(String(p.freshness)) && object(p.locator) && p.locator.kind === 'row'
        && typeof p.locator.collection === 'string' && typeof p.locator.row_id === 'string' && Array.isArray(p.locator.field_path)
        && p.locator.field_path.every(s => typeof s === 'string' || Number.isInteger(s))));
}
function validRelationship(value: unknown): boolean {
  return object(value) && typeof value.id === 'string' && typeof value.predicate === 'string' && typeof value.target_entity_id === 'string'
    && ['incoming', 'outgoing'].includes(String(value.direction)) && Array.isArray(value.evidence) && value.evidence.every(object)
    && object(value.subject) && (value.subject.kind === 'entity' ? typeof value.subject.entity_id === 'string' : value.subject.kind === 'record' && typeof value.subject.record_id === 'string')
    && object(value.registry_locator) && typeof value.registry_locator.identity_hash === 'string' && typeof value.registry_locator.entity_id === 'string'
    && Number.isInteger(value.registry_locator.relationship_index);
}
export function parseProjection(value: unknown): EntityProjection {
  if (!object(value) || value.schema_version !== 1 || typeof value.projection_version !== 'string'
    || typeof value.dataset_version !== 'string' || typeof value.identity_hash !== 'string'
    || !object(value.entity) || typeof value.entity.id !== 'string' || typeof value.entity.name !== 'string' || typeof value.entity.kind !== 'string' || !strings(value.entity.aliases)
    || !nullableText(value.selected_record_group) || typeof value.properties_complete !== 'boolean'
    || !Array.isArray(value.properties) || !value.properties.every(validProperty)
    || !Array.isArray(value.relationships) || !value.relationships.every(validRelationship)
    || !Array.isArray(value.coverage) || !value.coverage.every(c => object(c) && typeof c.reason === 'string' && nullableText(c.collection) && nullableText(c.record_id) && nullableText(c.detail) && strings(c.fields))
    || !Array.isArray(value.record_groups) || !value.record_groups.every(g => object(g) && typeof g.key === 'string' && typeof g.label === 'string' && typeof g.record_type === 'string'
      && Number.isInteger(g.total) && Number(g.total) >= 0 && Number.isInteger(g.returned) && nullableText(g.next_cursor)
      && object(g.filters) && Object.values(g.filters).every(nullableText) && strings(g.filter_fields) && typeof g.ordering === 'string'
      && Array.isArray(g.records) && g.returned === g.records.length && g.records.length <= Number(g.total)
      && g.records.every(r => object(r) && typeof r.id === 'string' && typeof r.label === 'string' && typeof r.record_type === 'string'
        && Array.isArray(r.context) && r.context.every(validProperty) && Array.isArray(r.properties) && r.properties.every(validProperty)
        && Array.isArray(r.relationships) && r.relationships.every(validRelationship)))) {
    throw new ProjectionError('This projection response is not supported by this Explorer.');
  }
  const parsed = value as unknown as EntityProjection;
  const unique = (ids: string[]) => new Set(ids).size === ids.length;
  if (!unique(parsed.record_groups.map(g => g.key)) || parsed.record_groups.some(g => !unique(g.records.map(r => r.id)))) {
    throw new ProjectionError('Projection contains repeated record or group IDs.');
  }
  return parsed;
}

export async function readProjection(graph: KnowledgeIndex, entityId: string, signal: AbortSignal, group?: RecordGroup, fetcher = fetch): Promise<EntityProjection> {
  const params = new URLSearchParams({ entity_id: entityId, dataset_version: graph.dataset_version, identity_hash: graph.identity_hash, limit: String(PROJECTION_PAGE_SIZE) });
  if (group) {
    params.set('record_group', group.key); params.set('filters', JSON.stringify(group.filters));
    if (group.next_cursor) params.set('cursor', group.next_cursor);
  }
  const response = await fetcher(`/api/brain/graph/projection/v1?${params}`, { signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]), cache: 'no-store' });
  if (response.status === 409) throw changed();
  if (!response.ok) throw new ProjectionError(`Projection unavailable (${response.status}).`);
  const result = parseProjection(await response.json());
  if (result.dataset_version !== graph.dataset_version || result.identity_hash !== graph.identity_hash || result.entity.id !== entityId) throw changed();
  if (result.selected_record_group !== (group?.key ?? null)) throw new ProjectionError('Unexpected projection record group.');
  return result;
}

export function fallbackReason(projection: EntityProjection): string | undefined {
  const unmigrated = projection.coverage.filter(issue => issue.reason === 'collection_not_migrated');
  if (unmigrated.length) return `Collections awaiting migration: ${unmigrated.map(issue => issue.collection).join(', ')}.`;
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
  return { ...current, record_groups: current.record_groups.map(g => g.key === requested.key ? { ...next, records: [...g.records, ...next.records], returned: g.records.length + next.records.length } : g), coverage: [...current.coverage, ...page.coverage.filter(c => !current.coverage.some(old => JSON.stringify(old) === JSON.stringify(c)))] };
}

export interface AttachmentNode {
  id: string; label: string; kind: 'entity' | 'group' | 'record' | 'property' | 'value' | 'relationship';
  subtitle?: string; values?: { value: unknown; assertion: Assertion }[];
  children: AttachmentNode[]; pending?: boolean;
  relationship?: ProjectionRelationship; target?: CampusEntity;
}
const nodeId = (...parts: unknown[]) => JSON.stringify(parts);
function entries(value: unknown): [string, unknown][] { return Array.isArray(value) ? value.map((v, i) => [String(i + 1), v]) : object(value) ? Object.entries(value) : []; }
export function valueText(value: unknown): string {
  if (value === null) return 'Not published';
  if (Array.isArray(value)) return value.length ? `${value.length} items` : 'Empty list';
  if (object(value)) return Object.keys(value).length ? `${Object.keys(value).length} details` : 'Empty object';
  return value === '' ? 'Empty value' : String(value);
}
function valueNode(id: string, label: string, value: unknown, assertion: Assertion): AttachmentNode {
  return { id, label, kind: 'value', values: [{ value, assertion }], children: entries(value).map(([key, child]) => valueNode(nodeId(id, key), key, child, assertion)) };
}
function propertyNode(owner: string, property: ProjectionProperty): AttachmentNode {
  const id = nodeId(owner, 'property', property.key);
  const structured = property.assertions.some(a => entries(a.value).length > 0);
  return { id, label: property.label, kind: 'property', values: property.assertions.map(assertion => ({ value: assertion.value, assertion })),
    children: !structured ? [] : property.assertions.length === 1
      ? valueNode(id, property.label, property.assertions[0].value, property.assertions[0]).children
      : property.assertions.map((a, i) => valueNode(nodeId(id, a.id), `Source value ${i + 1}`, a.value, a)) };
}
function relationshipNode(owner: string, rel: ProjectionRelationship, entities: Map<string, CampusEntity>): AttachmentNode {
  const targetId = rel.direction === 'incoming' ? rel.subject.kind === 'entity' ? rel.subject.entity_id : undefined : rel.target_entity_id;
  const target = targetId ? entities.get(targetId) : undefined;
  return { id: nodeId(owner, 'relationship', rel.id), label: target?.name ?? 'Unresolved relationship', kind: 'relationship',
    subtitle: relationshipLabel(rel.predicate, rel.direction === 'incoming'), children: [], relationship: rel, target };
}
export function projectionTree(projection: EntityProjection, graph: KnowledgeIndex): AttachmentNode {
  const entities = new Map(graph.nodes.map(e => [e.id, e]));
  const owner = projection.entity.id;
  return { id: owner, label: projection.entity.name, kind: 'entity', subtitle: projection.entity.kind.replaceAll('_', ' '), children: [
    ...projection.relationships.map(r => relationshipNode(owner, r, entities)),
    ...projection.properties.map(p => propertyNode(owner, p)),
    ...projection.record_groups.map(group => ({ id: nodeId(owner, 'group', group.key), label: group.label, kind: 'group' as const,
      subtitle: `${group.records.length} of ${group.total} records`, pending: group.next_cursor !== null,
      children: group.records.map(record => ({ id: nodeId(owner, 'record', group.key, record.id), label: record.label, kind: 'record' as const,
        subtitle: record.context.map(p => `${p.label}: ${p.assertions.map(a => valueText(a.value)).join(' / ')}`).join(' · '),
        children: [...record.context.map(p => propertyNode(nodeId(record.id, 'context'), p)), ...record.properties.map(p => propertyNode(nodeId(record.id, 'properties'), p)), ...record.relationships.map(r => relationshipNode(record.id, r, entities))],
      })),
    })),
  ] };
}
export function findAttachment(root: AttachmentNode, id: string): AttachmentNode | undefined {
  if (root.id === id) return root;
  for (const child of root.children) { const found = findAttachment(child, id); if (found) return found; }
}
export function hasChildren(node: AttachmentNode): boolean { return !!node.target || node.children.length > 0 || !!node.pending; }
