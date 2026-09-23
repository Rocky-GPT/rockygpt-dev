/**
 * @module lib/identity-aliases
 * Every alias in the campus identity map: what a lookup by it finds, and why
 * each identity carries it.
 *
 * The brain's `GET /v1/dev/identities/aliases` matches names the way chat
 * lookup does, and passes through the data compiler's `alias_sources`: the rule
 * and evidence that put each alias on its identity. A release built before the
 * compiler recorded them has `sources_published: false`, and every alias then
 * shows its target without a reason rather than a guessed one.
 */

import type { IdentityKind } from './identities.ts';

export type AliasBasis =
  | 'human_reviewed'
  | 'identity_map'
  | 'record_name'
  | 'department'
  | 'abbreviation'
  | 'program_family'
  | 'school_abbreviation'
  | 'school_former_name'
  | 'subject_code'
  | 'event_title';

export interface AliasEvidence {
  collection: string;
  source_key: string;
  source_record_key: string;
  source_record_id?: string;
  field: string;
  source_url?: string;
}

export interface AliasSource {
  basis: AliasBasis;
  evidence?: AliasEvidence;
  source_url?: string;
  reviewed_at?: string;
  note?: string;
}

export interface AliasMatch {
  id: string;
  name: string;
  kind: IdentityKind;
  status?: string;
  /** The alias is this identity's own name once spacing and case are ignored. */
  by_name: boolean;
  aliases: { alias: string; sources: AliasSource[] }[];
}

/** `single`: one identity. `ambiguous`: lookup asks which one. `event_dates`: one event on several dates; a question's date picks. */
export type AliasLookup = 'single' | 'ambiguous' | 'event_dates';

export interface AliasRow {
  alias: string;
  lookup: AliasLookup;
  matches: AliasMatch[];
}

export interface AliasTable {
  dataset_version: string;
  campus_date: string;
  identity_hash: string;
  sources_published: boolean;
  alias_count: number;
  aliases: AliasRow[];
}

/** Ordered as the filter shows them: human decisions first, then the source rules. */
export const BASES: { basis: AliasBasis; label: string; description: string }[] = [
  { basis: 'human_reviewed', label: 'Human-reviewed', description: 'A person approved it. No Ramapo source publishes it.' },
  { basis: 'identity_map', label: 'Identity map', description: 'Listed in the reviewed identity map.' },
  { basis: 'record_name', label: 'Linked record name', description: 'A record linked to this identity publishes it as its name.' },
  { basis: 'department', label: 'Directory department', description: 'Its own directory entry publishes it as the department.' },
  { basis: 'abbreviation', label: 'Abbreviation in name', description: 'The abbreviation in parentheses in its name, or the name without it.' },
  { basis: 'program_family', label: 'Program family', description: 'The program name without its degree designation.' },
  { basis: 'school_abbreviation', label: 'School abbreviation', description: "The abbreviation in the school's reviewed entry, beside its official page." },
  { basis: 'school_former_name', label: 'Former school name', description: 'A former name the school replaced, with recorded evidence.' },
  { basis: 'subject_code', label: 'Subject code', description: "A course subject's catalog code: the only name it answers to in lookup. Its name and short forms work in course search." },
  { basis: 'event_title', label: 'Event title', description: "The event's published title, without its date." },
];

const BASIS_SET: ReadonlySet<string> = new Set(BASES.map(item => item.basis));
const LOOKUPS: ReadonlySet<string> = new Set(['single', 'ambiguous', 'event_dates']);

export const LOOKUP_LABELS: Record<AliasLookup, string> = {
  single: 'Finds one',
  ambiguous: 'Asks which one',
  event_dates: 'Asks which date',
};

/** One entity's kind, for a badge beside its name. */
export const KIND_NAMES: Record<IdentityKind, string> = {
  person: 'Person', office: 'Office', facility: 'Facility', venue: 'Dining venue', program: 'Program',
  club: 'Club', organization: 'Organization', event: 'Event', building: 'Building', school: 'School',
  subject: 'Course subject',
};

export function basisLabel(basis: AliasBasis): string {
  return BASES.find(item => item.basis === basis)?.label ?? basis;
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isText = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

function validSource(value: unknown): value is AliasSource {
  if (!isObject(value) || !BASIS_SET.has(value.basis as string)) return false;
  const evidence = value.evidence;
  if (evidence !== undefined && !(isObject(evidence) && isText(evidence.collection) && isText(evidence.source_key) && isText(evidence.source_record_key) && isText(evidence.field))) return false;
  return ['source_url', 'reviewed_at', 'note'].every(key => value[key] === undefined || isText(value[key]));
}

function validMatch(value: unknown): value is AliasMatch {
  return isObject(value) && isText(value.id) && isText(value.name) && isText(value.kind) && typeof value.by_name === 'boolean'
    && (value.status === undefined || isText(value.status))
    && Array.isArray(value.aliases) && value.aliases.every(item => isObject(item) && isText(item.alias) && Array.isArray(item.sources) && item.sources.every(validSource));
}

/** The brain's alias table, or an error naming what is wrong with it. */
export function parseAliasTable(value: unknown): AliasTable {
  if (!isObject(value) || !isText(value.dataset_version) || !isText(value.identity_hash) || typeof value.sources_published !== 'boolean'
    || typeof value.alias_count !== 'number' || !Array.isArray(value.aliases)) {
    throw new Error('The brain returned an alias table this page does not recognize.');
  }
  for (const row of value.aliases) {
    if (!isObject(row) || !isText(row.alias) || !LOOKUPS.has(row.lookup as string) || !Array.isArray(row.matches) || !row.matches.length || !row.matches.every(validMatch)) {
      throw new Error('The brain returned an alias this page does not recognize.');
    }
  }
  return value as unknown as AliasTable;
}

/** Every basis that puts this alias on any identity it finds. */
export function rowBases(row: AliasRow): Set<AliasBasis> {
  return new Set(row.matches.flatMap(match => match.aliases.flatMap(alias => alias.sources.map(source => source.basis))));
}

/**
 * `events`: include names only events answer to. Each event's title is its alias,
 * so they outnumber every other kind; a search, or choosing the event basis or
 * kind, includes them.
 */
export interface AliasFilter { query: string; basis: AliasBasis | 'all'; kind: IdentityKind | 'all'; lookup: AliasLookup | 'all'; events: boolean }

export const onlyEvents = (row: AliasRow): boolean => row.matches.every(match => match.kind === 'event');

const fold = (value: string) => value.normalize('NFKC').replace(/\s+/g, ' ').trim().toLocaleLowerCase();

export function filterAliasRows(rows: AliasRow[], filter: AliasFilter): AliasRow[] {
  const query = fold(filter.query);
  const events = filter.events || Boolean(query) || filter.basis === 'event_title' || filter.kind === 'event';
  return rows.filter(row => (events || !onlyEvents(row))
    && (filter.lookup === 'all' || row.lookup === filter.lookup)
    && (filter.basis === 'all' || rowBases(row).has(filter.basis))
    && (filter.kind === 'all' || row.matches.some(match => match.kind === filter.kind))
    && (!query || fold(row.alias).includes(query) || row.matches.some(match => fold(match.name).includes(query))));
}

/** How many aliases each basis explains; an alias with two bases counts under both. */
export function basisCounts(rows: AliasRow[]): Map<AliasBasis, number> {
  const counts = new Map<AliasBasis, number>();
  for (const row of rows) for (const match of row.matches) for (const alias of match.aliases) {
    for (const basis of new Set(alias.sources.map(source => source.basis))) counts.set(basis, (counts.get(basis) ?? 0) + 1);
  }
  return counts;
}

/** Sources of one alias, grouped by basis so seven weekday records read as one reason. */
export function groupSources(sources: AliasSource[]): { basis: AliasBasis; sources: AliasSource[] }[] {
  const groups = new Map<AliasBasis, AliasSource[]>();
  for (const source of sources) groups.set(source.basis, [...(groups.get(source.basis) ?? []), source]);
  return [...groups].map(([basis, grouped]) => ({ basis, sources: grouped }));
}

/** The published record field a source cites, as `collection · record · field`. */
export function evidenceText(evidence: AliasEvidence): string {
  return `${evidence.collection} · ${evidence.source_record_key} · ${evidence.field}`;
}
