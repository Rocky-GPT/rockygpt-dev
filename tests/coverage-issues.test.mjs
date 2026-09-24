import assert from 'node:assert/strict';
import test from 'node:test';
import { coverageGroup, groupCoverage } from '../lib/coverage-issues.ts';

// One published example of each reason template in rockygpt-data's identity compiler.
const reasons = {
  unlinked: [
    'No reviewed persistent identity selector covers this original record; existing search remains available.',
    'An Archway group named like a reviewed campus identity or its published department needs a reviewed link; no duplicate identity is created. Existing search remains available.',
    'No unique explicit Archway group ID can be attached through the original published website URL; a matching name alone is insufficient.',
    'Several original club records claim the same external group ID; identity is ambiguous.',
    'Missing or nonunique explicit Archway event occurrence ID; title similarity and date alone cannot establish a stable identity.',
    'The reviewed building "Birch Mansion" is named "Birch" on the map; it is not published until the review matches.',
    'The map entry has no Concept3D location ID, so it has no persistent building identity.',
    'Concept3D location 123 is shared by several map entries; no single building identity.',
    'A room prefix is claimed by another building or is not an uppercase code.',
    'ambiguous_course_identity',
  ],
  empty: [
    'No current source row satisfies the reviewed selector. The seed is retained, but an identity is published only if another verified record link resolves.',
    'Broken original record link in this release.',
    'The reviewed Archway group School of Contemporary Arts has 0 records in this release; it is not linked.',
    "No course in this release's catalog carries this subject code; no subject identity is created.",
    'The reviewed Concept3D location 456 is not on the committed map.',
    'The reviewed alias "Potter" names an identity that is not in this release under that name; it is not applied.',
  ],
  connection: [
    'Undated profile course title has no explicit catalog code; title similarity does not establish a catalog link.',
    'Explicit code ZZZZ 999 is absent from this release catalog.',
    'No explicit catalog Convener-field profile link; normalized convener may be a legacy first-faculty fallback and is not approved.',
    'Explicit convener profile URL https://www.ramapo.edu/hgs/faculty/a resolves to 0 person identities.',
    'No explicit catalog Program Faculty-field profile link.',
    'Explicit Program Faculty profile URL https://www.ramapo.edu/hgs/faculty/a resolves to 0 person identities.',
    'Identity anchors resolve to multiple distinct subjects (for example a reused email and retained profile URL); no link is approved.',
    'Explicit captured organizer assertions conflict; no organizer identity relationship is approved.',
    'No captured explicit organizer group ID and linked group page; organizer and location names remain source text, not identity links.',
    'Explicit organizer group ID has no Archway group identity; directory groups are never merged with offices by name.',
    'The reviewed Archway group School of Business has 2 records in this release; it is not linked.',
    'Catalog school "Humanities" was split between current schools; the program is not placed in one.',
    'The faculty profile marks this person retired; no current school is linked.',
    'Published school "School of Old Studies" is not a current official school or a reviewed legacy name of one.',
    'Published room "Main Office" is not one or more PREFIX-NUMBER rooms with reviewed building prefixes; no building is inferred.',
    'The course code has no leading subject code; it is not placed in a subject.',
    'unresolved_relationship',
  ],
  note: [
    'Shares its name with the office "Student Center"; a name lookup asks which one is meant.',
    'The catalog department list publishes no name for this subject code; the subject is named by its code.',
    'Event occurrence identity is explicit but its date is not published; the profile must keep the date unknown.',
    'Current event organizer text conflicts with the captured explicitly identified organizer; both source assertions are retained without choosing authority.',
    'The reviewed alias "Potter" does not fit: the identity already has 32 aliases.',
  ],
};

test('every reason template the Data identity compiler writes lands in its group', () => {
  for (const [group, list] of Object.entries(reasons)) {
    for (const reason of list) assert.equal(coverageGroup({ entity: 'Example', collection: 'contacts', reason }), group, reason);
  }
});

test('a plan or program page no program takes has no entity, whatever its own limitation says', () => {
  for (const collection of ['graduation_plans', 'major_pages']) {
    assert.equal(coverageGroup({ collection, record: 'plan', reason: 'The listed link led to a page that does not name this plan.' }), 'unlinked');
  }
});

test('an unrecognized reason stays visible under Other', () => {
  assert.equal(coverageGroup({ collection: 'events', reason: 'A reason written after this panel.' }), 'other');
  assert.equal(coverageGroup({ reason: 'artifact_projection_unavailable' }), 'other');
  assert.equal(coverageGroup({}), 'other');
});

test('groups keep a fixed order, skip empty groups and list the largest collections first', () => {
  const issue = (collection, reason) => ({ collection, reason });
  const groups = groupCoverage([
    issue('subjects', reasons.note[1]),
    issue('clubs', reasons.unlinked[1]),
    issue('campus_hours', reasons.unlinked[0]),
    issue('courses', reasons.connection[0]),
    issue('campus_hours', reasons.unlinked[0]),
    issue(undefined, 'Something new.'),
  ]);
  assert.deepEqual(groups.map(group => [group.id, group.issues.length]), [['unlinked', 3], ['connection', 1], ['note', 1], ['other', 1]]);
  assert.deepEqual(groups[0].collections, [['campus_hours', 2], ['clubs', 1]]);
  assert.deepEqual(groups[0].issues.map(item => item.collection), ['campus_hours', 'campus_hours', 'clubs']);
  assert.deepEqual(groups[3].collections, [['unspecified', 1]]);
});
