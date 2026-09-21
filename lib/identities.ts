export type ProfileSection = 'contact' | 'hours' | 'faculty' | 'courses' | 'program' | 'conveners' | 'menu' | 'club' | 'event';
export type IdentityKind = 'person' | 'office' | 'facility' | 'venue' | 'program' | 'club' | 'event';

export interface RecordReference {
  collection: string;
  source_key: string;
  source_record_key: string;
  source_record_id?: string;
}
export interface IdentityLink {
  collection: string;
  source_key: string;
  source_record_keys: string[];
  source_record_ids?: string[];
}
export interface IdentityRelationship {
  type: 'convener' | 'profile_course' | 'organized_by';
  target_entity_id: string | null;
  target_record: RecordReference | null;
  evidence: (RecordReference & { field: string; source_url?: string | null })[];
}
export interface Identity {
  id: string;
  name: string;
  kind: IdentityKind;
  aliases: string[];
  links: IdentityLink[];
  relationships: IdentityRelationship[];
}
export interface UnresolvedLink {
  entity?: string;
  collection: string;
  record: string;
  reason: string;
}
export interface IdentityIndex {
  dataset_version: string;
  campus_date: string;
  identity_hash: string;
  identities: Identity[];
  coverage: {
    identity_count: number;
    identities_by_kind: Record<string, number>;
    linked_records: Record<string, number>;
    relationships: Record<string, number>;
    unresolved: UnresolvedLink[];
  } | null;
}
export interface ProfileRecord {
  id: string;
  title: string;
  collection: string;
  source_title: string;
  source_key: string;
  url: string;
  collected_at: string | null;
  freshness: string;
  fields: Record<string, unknown>;
  limitations: string[];
}
export interface ProfileComponent {
  status: string;
  evidence_ids: string[];
  fields: Record<string, string>;
  conflicts: Record<string, { value: unknown; evidence_ids: string[] }[]>;
  linked_records_missing: number;
  relationships_missing: number;
  failed_links: number;
  total_matches: number;
  returned_count: number;
  omitted_count: number;
  truncated: boolean;
  reason?: string;
  service_date?: string;
  meal?: string | null;
  availability_scope?: string;
  temporal_scope?: string;
  timezone?: string;
  requested_date?: string | null;
  occurrence_dates?: string[];
  linked_event_candidates?: number;
  unexamined_event_candidates?: number;
}
export interface ProfileResponse {
  dataset_version: string;
  campus_date: string;
  identity_hash: string;
  profile: {
    status: string;
    dataset_version: string;
    resolution: { status: string; entity: Pick<Identity, 'id' | 'name' | 'kind'> | null };
    records: ProfileRecord[];
    components: Partial<Record<ProfileSection, ProfileComponent>>;
  };
}

export const SECTIONS: { key: ProfileSection; label: string }[] = [
  { key: 'contact', label: 'Contact' },
  { key: 'hours', label: 'Hours' },
  { key: 'faculty', label: 'Faculty profile' },
  { key: 'courses', label: 'Profile courses' },
  { key: 'program', label: 'Academic program' },
  { key: 'conveners', label: 'Conveners' },
  { key: 'menu', label: 'Menu' },
  { key: 'club', label: 'Club' },
  { key: 'event', label: 'Event occurrence' },
];
export const KIND_LABELS: Record<IdentityKind, string> = {
  person: 'People', office: 'Offices', facility: 'Facilities', venue: 'Dining venues', program: 'Academic programs',
  club: 'Clubs', event: 'Events',
};

export interface RelatedIdentityNode {
  key: string;
  name: string;
  label: string;
  detail: string;
  entityId?: string;
  section: ProfileSection;
  kind: IdentityKind | 'course';
}

export function relatedIdentityNodes(entity: Identity, identities: Identity[]): RelatedIdentityNode[] {
  const byId = new Map(identities.map(identity => [identity.id, identity]));
  const nodes = new Map<string, RelatedIdentityNode>();
  const definitions = {
    convener: { label: 'Has convener', reverse: 'Convener of', section: 'conveners', kind: 'person' },
    organized_by: { label: 'Organized by', reverse: 'Organizes event', section: 'event', kind: 'club' },
  } as const;
  for (const relationship of entity.relationships ?? []) {
    if (relationship.type === 'profile_course' && relationship.target_record) {
      const target = relationship.target_record;
      const key = `course:${target.source_key}:${target.source_record_key}`;
      nodes.set(key, {
        key, name: target.source_record_key, label: 'Profile-listed course',
        detail: 'Undated list · catalog link', section: 'courses', kind: 'course',
      });
    } else if (relationship.type !== 'profile_course' && relationship.target_entity_id) {
      const definition = definitions[relationship.type];
      if (!definition) continue;
      const target = byId.get(relationship.target_entity_id);
      const key = `${relationship.type}:${relationship.target_entity_id}`;
      nodes.set(key, {
        key, name: target?.name ?? 'Related identity unavailable', label: definition.label,
        detail: target ? 'Explicit identity relationship' : 'View published relationship evidence',
        entityId: target?.id, section: definition.section, kind: target?.kind ?? definition.kind,
      });
    }
  }
  for (const candidate of identities) {
    for (const relationship of candidate.relationships ?? []) {
      if (relationship.type === 'profile_course' || relationship.target_entity_id !== entity.id) continue;
      const definition = definitions[relationship.type];
      if (!definition) continue;
      const key = `${relationship.type}-of:${candidate.id}`;
      nodes.set(key, {
        key, name: candidate.name, label: definition.reverse,
        detail: candidate.kind === 'program' ? 'Academic program identity' : 'Event occurrence identity',
        entityId: candidate.id, section: definition.section, kind: candidate.kind,
      });
    }
  }
  return [...nodes.values()];
}

export function defaultProfileSection(kind: IdentityKind): ProfileSection {
  if (kind === 'program') return 'conveners';
  if (kind === 'venue' || kind === 'facility') return 'hours';
  if (kind === 'club' || kind === 'event') return kind;
  return 'contact';
}

export function profileSelectionFilters(kind: IdentityKind | undefined, serviceDate: string, meal: string, occurrenceDate: string): { date: string; meal: string } {
  return kind === 'event' || kind === 'club'
    ? { date: occurrenceDate, meal: '' }
    : { date: serviceDate, meal };
}

export function profileQueryParams(kind: IdentityKind, datasetVersion: string, date: string, meal: string): URLSearchParams {
  const params = new URLSearchParams({ dataset_version: datasetVersion, menu_limit: '12' });
  // An event identity is an occurrence. An empty date must not become campus today.
  if (date) params.set('date', date);
  if (kind !== 'event' && kind !== 'club' && meal.trim()) params.set('meal', meal.trim());
  return params;
}

export function sectionForCollection(collection: string): ProfileSection {
  const sections: Record<string, ProfileSection> = {
    contacts: 'contact', campus_hours: 'hours', dining_hours: 'hours', faculty: 'faculty',
    courses: 'courses', programs: 'program', menu: 'menu', clubs: 'club', events: 'event',
  };
  return sections[collection] ?? 'contact';
}

export function componentState(component?: ProfileComponent): { label: string; tone: 'good' | 'warn' | 'muted' } {
  if (!component) return { label: 'Not loaded', tone: 'muted' };
  if (Object.keys(component.conflicts).length) return { label: 'Conflicting values', tone: 'warn' };
  if (component.failed_links || component.linked_records_missing || component.relationships_missing) {
    return { label: 'Link needs attention', tone: 'warn' };
  }
  if (component.status === 'available') return { label: 'Available', tone: 'good' };
  if (component.status === 'partial') return { label: 'Partial', tone: 'warn' };
  return { label: component.status === 'missing' ? 'No linked evidence' : 'Unavailable', tone: 'muted' };
}

export function recordsForSection(profile: ProfileResponse['profile'], section: ProfileSection): ProfileRecord[] {
  const ids = new Set(profile.components[section]?.evidence_ids ?? []);
  return profile.records.filter(record => ids.has(record.id)).map(record => {
    // The shared profile response merges evidence reused by several sections.
    // Keep the contact/course view selective without changing the downloaded response.
    if (section === 'contact') return { ...record, fields: Object.fromEntries(
      Object.entries(record.fields).filter(([key]) => key === 'name' || key in (profile.components.contact?.fields ?? {})),
    ) };
    if (section === 'courses' && record.collection === 'faculty') {
      return { ...record, fields: { courses: record.fields.courses ?? null } };
    }
    return record;
  });
}

export function safeSourceUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : undefined;
  } catch { return undefined; }
}

export function publishedMealLabels(profile?: ProfileResponse['profile']): string[] {
  const labels = new Set<string>();
  for (const record of profile?.records ?? []) {
    if (record.collection === 'menu' && typeof record.fields.meal === 'string') labels.add(record.fields.meal);
    if (record.collection === 'dining_hours' && Array.isArray(record.fields.periods)) {
      for (const period of record.fields.periods) {
        if (period && typeof period === 'object' && typeof period.label === 'string') labels.add(period.label);
      }
    }
  }
  return [...labels].filter(label => label.trim()).sort();
}

export function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'Not published';
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}

export type IdentityWebNode =
  | { id: string; type: 'identity'; entity: Identity; expanded: boolean }
  | { id: string; type: 'sources'; ownerId: string; collection: string; links: IdentityLink[]; count: number; section: ProfileSection }
  | { id: string; type: 'course'; ownerId: string; reference: RecordReference; section: 'courses' };
export interface IdentityWebEdge {
  id: string;
  from: string;
  to: string;
  type: 'source' | IdentityRelationship['type'];
  evidence: IdentityRelationship['evidence'];
  links?: IdentityLink[];
}
export interface IdentityNeighborhood {
  nodes: IdentityWebNode[];
  edges: IdentityWebEdge[];
  omittedIdentities: number;
  omittedRecordGroups: number;
  unavailableTargets: number;
}

/** Only stored links form a neighborhood. Category membership is navigation, not a fact edge. */
export function identityNeighborhood(
  identities: Identity[], focusId: string, expandedIds: string[],
  limits = { identities: 8, records: 12 },
): IdentityNeighborhood {
  const byId = new Map(identities.map(entity => [entity.id, entity]));
  const expanded = new Set(expandedIds.filter(id => byId.has(id)));
  const candidates = new Set([focusId, ...expanded].filter(id => byId.has(id)));
  const relations: { owner: Identity; relationship: IdentityRelationship }[] = [];
  let unavailableTargets = 0;
  for (const owner of identities) for (const relationship of owner.relationships ?? []) {
    if (relationship.type === 'profile_course') continue;
    const targetId = relationship.target_entity_id;
    if (!expanded.has(owner.id) && !(targetId && expanded.has(targetId))) continue;
    if (!targetId || !byId.has(targetId)) { unavailableTargets++; continue; }
    candidates.add(owner.id); candidates.add(targetId);
    relations.push({ owner, relationship });
  }
  const visible = new Set([...candidates].slice(0, Math.max(1, limits.identities)));
  const nodes: IdentityWebNode[] = [...visible].map(id => ({ id, type: 'identity', entity: byId.get(id)!, expanded: expanded.has(id) }));
  const edges = new Map<string, IdentityWebEdge>();
  const addEdge = (edge: IdentityWebEdge) => {
    const previous = edges.get(edge.id);
    if (previous) previous.evidence = [...new Map([...previous.evidence, ...edge.evidence].map(ref => [JSON.stringify(ref), ref])).values()];
    else edges.set(edge.id, edge);
  };
  for (const { owner, relationship } of relations) {
    const targetId = relationship.target_entity_id!;
    if (!visible.has(owner.id) || !visible.has(targetId)) continue;
    addEdge({ id: `${owner.id}:${relationship.type}:${targetId}`, from: owner.id, to: targetId, type: relationship.type, evidence: relationship.evidence });
  }
  const records = new Map<string, IdentityWebNode>();
  const recordEdges: IdentityWebEdge[] = [];
  for (const id of visible) {
    if (!expanded.has(id)) continue;
    const owner = byId.get(id)!;
    const groups = new Map<string, IdentityLink[]>();
    for (const link of owner.links) groups.set(link.collection, [...(groups.get(link.collection) ?? []), link]);
    for (const [collection, links] of groups) {
      const nodeId = `sources:${id}:${collection}`;
      const keys = new Set(links.flatMap(link => (link.source_record_ids ?? link.source_record_keys).map(key => `${link.source_key}:${key}`)));
      records.set(nodeId, { id: nodeId, type: 'sources', ownerId: id, collection, links, count: keys.size, section: sectionForCollection(collection) });
      recordEdges.push({ id: `${id}:${nodeId}`, from: id, to: nodeId, type: 'source', evidence: [], links });
    }
    for (const relationship of owner.relationships ?? []) {
      if (relationship.type !== 'profile_course' || !relationship.target_record) continue;
      const target = relationship.target_record;
      const nodeId = `course:${target.source_key}:${target.source_record_id ?? target.source_record_key}`;
      records.set(nodeId, { id: nodeId, type: 'course', ownerId: id, reference: target, section: 'courses' });
      recordEdges.push({ id: `${id}:profile_course:${nodeId}`, from: id, to: nodeId, type: 'profile_course', evidence: relationship.evidence });
    }
  }
  const visibleRecords = [...records.values()].slice(0, Math.max(0, limits.records));
  const recordIds = new Set(visibleRecords.map(node => node.id));
  nodes.push(...visibleRecords);
  for (const edge of recordEdges) if (recordIds.has(edge.to)) addEdge(edge);
  return {
    nodes, edges: [...edges.values()], omittedIdentities: candidates.size - visible.size,
    omittedRecordGroups: records.size - visibleRecords.length, unavailableTargets,
  };
}
