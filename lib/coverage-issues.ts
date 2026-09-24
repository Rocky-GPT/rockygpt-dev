export type CoverageIssue = Record<string, unknown>;
export type CoverageGroupId = 'unlinked' | 'connection' | 'empty' | 'note' | 'other';
export interface CoverageGroup {
  id: CoverageGroupId; label: string; description: string;
  issues: CoverageIssue[]; collections: [string, number][];
}

export const COVERAGE_GROUPS: { id: CoverageGroupId; label: string; description: string }[] = [
  { id: 'unlinked', label: 'No entity', description: 'No entity links to these records. Search still finds them; entity lookups do not.' },
  { id: 'connection', label: 'Missing connection', description: 'The entity exists, but one of its links or references was not made.' },
  { id: 'empty', label: 'No data', description: 'A reviewed or listed entry has no records in this release.' },
  { id: 'note', label: 'Notes', description: 'Naming and interpretation notes. Nothing here is missing a link.' },
  { id: 'other', label: 'Other', description: 'Reasons this panel does not recognize yet. Read each one.' },
];

// Coverage reasons are prose written by the Data identity compiler. Each phrase
// identifies one reason template; the first match wins, so a zero-record group is
// No data before other group counts. A reason no phrase matches stays under Other.
const PHRASES: [CoverageGroupId, string][] = [
  ['unlinked', 'No reviewed persistent identity selector covers this original record'],
  ['unlinked', 'An Archway group named like a reviewed campus identity'],
  ['unlinked', 'No unique explicit Archway group ID can be attached'],
  ['unlinked', 'Several original club records claim the same external group ID'],
  ['unlinked', 'Missing or nonunique explicit Archway event occurrence ID'],
  ['unlinked', 'it is not published until the review matches'],
  ['unlinked', 'so it has no persistent building identity'],
  ['unlinked', 'no single building identity'],
  ['unlinked', 'A room prefix is claimed by another building'],
  ['unlinked', 'ambiguous_course_identity'],
  ['empty', 'No current source row satisfies the reviewed selector'],
  ['empty', 'Broken original record link in this release'],
  ['empty', 'has 0 records in this release'],
  ['empty', "No course in this release's catalog carries this subject code"],
  ['empty', 'is not on the committed map'],
  ['empty', 'names an identity that is not in this release'],
  ['connection', 'Undated profile course title has no explicit catalog code'],
  ['connection', 'is absent from this release catalog'],
  ['connection', 'No explicit catalog Convener-field profile link'],
  ['connection', 'Explicit convener profile URL'],
  ['connection', 'No explicit catalog Program Faculty-field profile link'],
  ['connection', 'Explicit Program Faculty profile URL'],
  ['connection', 'Identity anchors resolve to multiple distinct subjects'],
  ['connection', 'Explicit captured organizer assertions conflict'],
  ['connection', 'No captured explicit organizer group ID'],
  ['connection', 'Explicit organizer group ID has no Archway group identity'],
  ['connection', 'records in this release; it is not linked'],
  ['connection', 'was split between current schools'],
  ['connection', 'The faculty profile marks this person retired'],
  ['connection', 'is not a current official school'],
  ['connection', 'rooms with reviewed building prefixes'],
  ['connection', 'The course code has no leading subject code'],
  ['connection', 'unresolved_relationship'],
  ['note', 'Shares its name with the'],
  ['note', 'The catalog department list publishes no name for this subject code'],
  ['note', 'Event occurrence identity is explicit but its date is not published'],
  ['note', 'Current event organizer text conflicts with the captured'],
  ['note', 'does not fit: the identity already has'],
];
// Graduation plans and program pages join a program by catalog code. The compiler
// reports each one no program takes, with the record's own limitation as its reason.
const PROGRAM_RECORDS = new Set(['graduation_plans', 'major_pages']);

export function coverageGroup(issue: CoverageIssue): CoverageGroupId {
  if (PROGRAM_RECORDS.has(String(issue.collection)) && !issue.entity) return 'unlinked';
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
