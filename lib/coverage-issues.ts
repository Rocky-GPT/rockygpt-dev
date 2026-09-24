export type CoverageIssue = Record<string, unknown>;
/** The Data identity compiler's coverage kinds, plus Other for anything else. */
export type CoverageGroupId = 'unlinked_record' | 'missing_connection' | 'no_records' | 'note' | 'other';
export interface CoverageGroup {
  id: CoverageGroupId; label: string; description: string;
  issues: CoverageIssue[]; collections: [string, number][];
}

export const COVERAGE_GROUPS: { id: CoverageGroupId; label: string; description: string }[] = [
  { id: 'unlinked_record', label: 'No entity', description: 'No entity links to these records. Search still finds them; entity lookups do not.' },
  { id: 'missing_connection', label: 'Missing connection', description: 'The entity exists, but one of its links or references was not made.' },
  { id: 'no_records', label: 'No data', description: 'A reviewed or listed entry has no records in this release.' },
  { id: 'note', label: 'Notes', description: 'Naming and interpretation notes. Nothing here is missing a link.' },
  { id: 'other', label: 'Other', description: 'Issues without a recognized kind. Read each reason.' },
];
const KINDS = new Set<string>(COVERAGE_GROUPS.map(group => group.id).filter(id => id !== 'other'));

// Releases published before coverage kinds carry only a reason: prose written by
// the Data identity compiler. Each phrase identifies one reason template; the first
// match wins, so a zero-record group is No data before other group counts.
const PHRASES: [CoverageGroupId, string][] = [
  ['unlinked_record', 'No reviewed persistent identity selector covers this original record'],
  ['unlinked_record', 'An Archway group named like a reviewed campus identity'],
  ['unlinked_record', 'No unique explicit Archway group ID can be attached'],
  ['unlinked_record', 'Several original club records claim the same external group ID'],
  ['unlinked_record', 'Missing or nonunique explicit Archway event occurrence ID'],
  ['unlinked_record', 'it is not published until the review matches'],
  ['unlinked_record', 'so it has no persistent building identity'],
  ['unlinked_record', 'no single building identity'],
  ['unlinked_record', 'A room prefix is claimed by another building'],
  ['unlinked_record', 'ambiguous_course_identity'],
  ['no_records', 'No current source row satisfies the reviewed selector'],
  ['no_records', 'Broken original record link in this release'],
  ['no_records', 'has 0 records in this release'],
  ['no_records', "No course in this release's catalog carries this subject code"],
  ['no_records', 'is not on the committed map'],
  ['no_records', 'names an identity that is not in this release'],
  ['missing_connection', 'Undated profile course title has no explicit catalog code'],
  ['missing_connection', 'is absent from this release catalog'],
  ['missing_connection', 'No explicit catalog Convener-field profile link'],
  ['missing_connection', 'Explicit convener profile URL'],
  ['missing_connection', 'No explicit catalog Program Faculty-field profile link'],
  ['missing_connection', 'Explicit Program Faculty profile URL'],
  ['missing_connection', 'Identity anchors resolve to multiple distinct subjects'],
  ['missing_connection', 'Explicit captured organizer assertions conflict'],
  ['missing_connection', 'No captured explicit organizer group ID'],
  ['missing_connection', 'Explicit organizer group ID has no Archway group identity'],
  ['missing_connection', 'Current event organizer text conflicts with the captured'],
  ['missing_connection', 'records in this release; it is not linked'],
  ['missing_connection', 'was split between current schools'],
  ['missing_connection', 'The faculty profile marks this person retired'],
  ['missing_connection', 'is not a current official school'],
  ['missing_connection', 'rooms with reviewed building prefixes'],
  ['missing_connection', 'The course code has no leading subject code'],
  ['missing_connection', 'unresolved_relationship'],
  ['note', 'Shares its name with the'],
  ['note', 'The catalog department list publishes no name for this subject code'],
  ['note', 'Event occurrence identity is explicit but its date is not published'],
  ['note', 'does not fit: the identity already has'],
];
// Graduation plans and program pages join a program by catalog code. The compiler
// reports each one no program takes, with the record's own limitation as its reason.
const PROGRAM_RECORDS = new Set(['graduation_plans', 'major_pages']);

export function coverageGroup(issue: CoverageIssue): CoverageGroupId {
  // The compiler's kind decides; a kind this panel does not know stays under Other.
  if (typeof issue.kind === 'string') return KINDS.has(issue.kind) ? issue.kind as CoverageGroupId : 'other';
  if (PROGRAM_RECORDS.has(String(issue.collection)) && !issue.entity) return 'unlinked_record';
  const reason = String(issue.reason ?? '');
  return PHRASES.find(([, phrase]) => reason.includes(phrase))?.[0] ?? 'other';
}

export function coverageCollection(issue: CoverageIssue): string {
  return typeof issue.collection === 'string' ? issue.collection : 'unspecified';
}

/** Nonempty groups in a fixed order; each group's issues follow its largest collections first. */
export function groupCoverage(issues: CoverageIssue[]): CoverageGroup[] {
  const members = new Map<CoverageGroupId, CoverageIssue[]>(COVERAGE_GROUPS.map(group => [group.id, []]));
  for (const issue of issues) members.get(coverageGroup(issue))!.push(issue);
  return COVERAGE_GROUPS.flatMap(group => {
    const grouped = members.get(group.id)!;
    if (!grouped.length) return [];
    const counts = new Map<string, number>();
    for (const issue of grouped) counts.set(coverageCollection(issue), (counts.get(coverageCollection(issue)) ?? 0) + 1);
    const collections = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const rank = new Map(collections.map(([name], index) => [name, index]));
    const ordered = [...grouped].sort((a, b) => rank.get(coverageCollection(a))! - rank.get(coverageCollection(b))!);
    return [{ ...group, issues: ordered, collections }];
  });
}
