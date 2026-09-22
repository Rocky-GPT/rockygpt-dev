export interface CampusEntity { id: string; kind: string; name: string; aliases: string[] }
export interface CampusRelationship {
  source: string; target: string; type: string;
  evidence: { collection: string; source_key: string; source_record_key: string; field: string; source_url?: string }[];
}
export interface KnowledgeIndex {
  dataset_version: string; identity_hash: string; campus_date: string;
  nodes: CampusEntity[]; edges: CampusRelationship[];
  diagnostics: Record<string, unknown>[];
}
export interface PropertyRecord {
  id: string; title: string; fields: Record<string, unknown>;
  source_title?: string; source_key?: string; url?: string; collected_at?: string;
  valid_from?: string; valid_until?: string; freshness?: string; limitations?: string[];
}
export interface PropertyGroup { collection: string; records: PropertyRecord[]; total: number; next_offset: number | null }
export interface EntityProperties {
  dataset_version: string; identity_hash: string; entity_id: string;
  groups: PropertyGroup[]; diagnostics: Record<string, unknown>[];
}

export interface AttachedField {
  key: string;
  label: string;
  values: { value: unknown; record: PropertyRecord; collection: string }[];
}

/** Fields are visual attachments, never inferred campus identities or relationships. */
export function attachedFields(groups: PropertyGroup[]): AttachedField[] {
  const fields = new Map<string, AttachedField>();
  for (const group of groups) for (const record of group.records) {
    for (const [key, value] of Object.entries(record.fields)) {
      const field = fields.get(key) ?? { key, label: key.replaceAll('_', ' '), values: [] };
      field.values.push({ value, record, collection: group.collection });
      fields.set(key, field);
    }
  }
  return [...fields.values()];
}

export function fieldPreview(value: unknown): string {
  if (value === null || value === undefined) return 'Not published';
  if (Array.isArray(value)) return value.length ? `${value.length} items · open to explore` : 'None listed';
  if (typeof value === 'object') return `${Object.keys(value).length} details · open to explore`;
  return String(value) === '' ? 'Empty value' : String(value);
}
export type TraversalStep =
  | { type: 'campus'; label: string }
  | { type: 'category'; label: string; kind: string; query: string }
  | { type: 'entity'; label: string; id: string; via?: string }
  | { type: 'attachment'; label: string; entityId: string; nodeId: string };
export const CAMPUS: TraversalStep = { type: 'campus', label: 'Ramapo College' };
const labels: Record<string, string> = { person: 'People', office: 'Offices', facility: 'Facilities', venue: 'Dining locations', program: 'Programs', club: 'Clubs', event: 'Events', course: 'Courses' };
export function kindLabel(kind: string) { return labels[kind] ?? `${kind.replaceAll('_', ' ')}s`; }
export function relationshipLabel(type: string, incoming = false): string {
  const names: Record<string, [string, string]> = {
    organized_by: ['organized by', 'organizes'], convener: ['has convener', 'convener of'],
    profile_course: ['lists course (undated)', 'listed in profile of (undated)'],
    teaches: ['teaches', 'taught by'], requires: ['requires', 'required by'],
    part_of: ['part of', 'contains'], located_at: ['located at', 'location of'], advisor: ['has advisor', 'advisor of'],
  };
  return names[type]?.[incoming ? 1 : 0] ?? `${incoming ? 'incoming: ' : ''}${type.replaceAll('_', ' ')}`;
}
export function connections(graph: KnowledgeIndex, id: string) {
  const nodes = new Map(graph.nodes.map(node => [node.id, node]));
  return graph.edges.flatMap((edge, index) => {
    if (edge.source !== id && edge.target !== id) return [];
    const incoming = edge.target === id;
    const target = nodes.get(incoming ? edge.source : edge.target);
    return target ? [{ key: index, edge, target, incoming, label: relationshipLabel(edge.type, incoming) }] : [];
  });
}
export function traverse(path: TraversalStep[], node: CampusEntity, via?: string): TraversalStep[] {
  // Keep the actual journey, including relationship direction and revisits.
  if (path.at(-1)?.type === 'entity' && (path.at(-1) as { id: string }).id === node.id) return path;
  return [...path, { type: 'entity', label: node.name, id: node.id, via }];
}
