export type ProfileSection = 'contact' | 'hours' | 'faculty' | 'courses' | 'program' | 'conveners' | 'menu';
export type IdentityKind = 'person' | 'office' | 'facility' | 'venue' | 'program';

export interface RecordReference {
  collection: string;
  source_key: string;
  source_record_key: string;
}
export interface IdentityLink {
  collection: string;
  source_key: string;
  source_record_keys: string[];
}
export interface IdentityRelationship {
  type: 'convener' | 'profile_course';
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
  { key: 'program', label: 'Program' },
  { key: 'conveners', label: 'Conveners' },
  { key: 'menu', label: 'Menu' },
];
export const KIND_LABELS: Record<IdentityKind, string> = {
  person: 'People', office: 'Offices', facility: 'Facilities', venue: 'Dining venues', program: 'Programs',
};

export function sectionForCollection(collection: string): ProfileSection {
  const sections: Record<string, ProfileSection> = {
    contacts: 'contact', campus_hours: 'hours', dining_hours: 'hours', faculty: 'faculty',
    courses: 'courses', programs: 'program', menu: 'menu',
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
