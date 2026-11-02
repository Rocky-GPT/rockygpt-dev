import assert from 'node:assert/strict';
import test from 'node:test';
import {
  componentState, defaultProfileSection, displayValue, identityNeighborhood, KIND_LABELS, profileQueryParams, profileSelectionFilters,
  publishedMealLabels, recordsForSection, relatedIdentityNodes, safeSourceUrl, sectionForCollection,
} from '../lib/identities.ts';

const component = {
  status: 'available', evidence_ids: ['contacts:a'], conflicts: {}, fields: {},
  failed_links: 0, linked_records_missing: 0, relationships_missing: 0,
  total_matches: 1, returned_count: 1, omitted_count: 0, truncated: false,
};

test('conflicting evidence and broken links cannot appear as healthy available sections', () => {
  const conflict = { ...component, conflicts: { phone: [{ value: '123', evidence_ids: ['contacts:a'] }] } };
  assert.equal(componentState(conflict).label, 'Conflicting values');
  assert.equal(componentState({ ...component, linked_records_missing: 1 }).tone, 'warn');
  assert.equal(componentState({ ...component, relationships_missing: 1 }).tone, 'warn');
});

test('missing hours and partial menu coverage remain distinct from closure and completeness', () => {
  assert.equal(componentState({ ...component, status: 'missing' }).label, 'No linked evidence');
  assert.equal(componentState({ ...component, status: 'partial', omitted_count: 39 }).label, 'Partial');
});

test('selecting a section shows only its own evidence even when the profile includes other records', () => {
  const contact = { id: 'contacts:a', fields: { email: 'test@example.edu' } };
  const menu = { id: 'menu:b' };
  assert.deepEqual(recordsForSection({ records: [contact, menu], components: { contact: { ...component, fields: { email: 'published' } } } }, 'contact'), [contact]);
  assert.deepEqual(recordsForSection({ records: [contact, menu], components: {} }, 'hours'), []);
});

test('merged faculty evidence remains selective in contact and undated course views', () => {
  const faculty = { id: 'faculty:a', collection: 'faculty', fields: { email: 'test@example.edu', bio: 'Biography', courses: ['Undated seminar'] } };
  const section = { ...component, evidence_ids: ['faculty:a'], fields: { email: 'published' } };
  const profile = { records: [faculty], components: { contact: section, courses: section } };
  assert.deepEqual(recordsForSection(profile, 'contact')[0].fields, { email: 'test@example.edu' });
  assert.deepEqual(recordsForSection(profile, 'courses')[0].fields, { courses: ['Undated seminar'] });
  assert.equal(faculty.fields.bio, 'Biography');
});

test('source links accept published web URLs and reject executable or local schemes', () => {
  assert.equal(safeSourceUrl('https://example.edu/faculty?a=1'), 'https://example.edu/faculty?a=1');
  for (const value of ['javascript:alert(1)', 'data:text/html,<script>', 'file:///private/file', '//example.edu', 'not a URL']) {
    assert.equal(safeSourceUrl(value), undefined);
  }
});

test('unknown field display does not erase explicit false or zero source values', () => {
  assert.equal(displayValue(null), 'Not published');
  assert.equal(displayValue(false), 'false');
  assert.equal(displayValue(0), '0');
});

test('meal controls preserve unusual published meal labels instead of inventing a fixed schedule', () => {
  assert.deepEqual(publishedMealLabels({ records: [
    { collection: 'dining_hours', fields: { periods: [{ label: 'Continental' }, { label: 'Lite Lunch' }, null] } },
    { collection: 'menu', fields: { meal: 'Lunch' } },
  ] }), ['Continental', 'Lite Lunch', 'Lunch']);
  assert.deepEqual(publishedMealLabels(), []);
});

test('clubs and event occurrences open their own evidence while programs remain academic', () => {
  assert.equal(defaultProfileSection('club'), 'club');
  assert.equal(defaultProfileSection('event'), 'event');
  assert.equal(defaultProfileSection('program'), 'conveners');
  assert.equal(sectionForCollection('clubs'), 'club');
  assert.equal(sectionForCollection('events'), 'event');
  assert.equal(defaultProfileSection('subject'), 'subject');
  assert.equal(sectionForCollection('subjects'), 'subject');
  assert.equal(KIND_LABELS.program, 'Academic programs');
});

test('an event profile has no implicit today or meal filter, and an explicit date remains optional', () => {
  const all = profileQueryParams('event', 'release-a', '', 'Dinner');
  assert.equal(all.has('date'), false);
  assert.equal(all.has('meal'), false);
  assert.equal(all.get('dataset_version'), 'release-a');
  assert.equal(profileQueryParams('event', 'release-a', '2026-09-26', '').get('date'), '2026-09-26');
  const dining = profileQueryParams('venue', 'release-a', '2026-09-21', ' Lite Lunch ');
  assert.equal(dining.get('date'), '2026-09-21');
  assert.equal(dining.get('meal'), 'Lite Lunch');
});

test('selecting a club after dining cannot inherit its service date or meal', () => {
  const dining = profileSelectionFilters('venue', '2026-09-21', 'Dinner', '');
  assert.deepEqual(dining, { date: '2026-09-21', meal: 'Dinner' });
  const club = profileSelectionFilters('club', '2026-09-21', 'Dinner', '');
  assert.deepEqual(club, { date: '', meal: '' });
  const params = profileQueryParams('club', 'release-a', club.date, club.meal);
  assert.equal(params.has('date'), false);
  assert.equal(params.has('meal'), false);
  assert.deepEqual(profileSelectionFilters('club', '2026-09-21', 'Dinner', '2026-09-26'), { date: '2026-09-26', meal: '' });
  assert.equal(profileQueryParams('club', 'release-a', '', 'Dinner').has('meal'), false);
});

test('event evidence preserves occurrence dates, missing times and original source timestamps', () => {
  const event = {
    id: 'events:row-1', collection: 'events', collected_at: '2026-09-21T15:00:00Z',
    fields: { title: 'Club gathering', occurrence_date: '2026-09-26', start_time: null, starts_at: '2026-09-26T04:00:00Z' },
  };
  const organizer = { id: 'clubs:row-2', collection: 'clubs', fields: { name: 'Published club' } };
  const profile = { records: [event, organizer], components: { event: { ...component, evidence_ids: [event.id] } } };
  assert.deepEqual(recordsForSection(profile, 'event'), [event]);
  assert.equal(displayValue(recordsForSection(profile, 'event')[0].fields.start_time), 'Not published');
  assert.equal(event.collected_at, '2026-09-21T15:00:00Z');
});

const identity = (id, kind, relationships = []) => ({
  id, kind, name: `${kind} ${id}`, aliases: [], links: [], relationships,
});

test('organizer links use stored IDs in both directions, never matching names or shared records', () => {
  const club = identity('club-1', 'club');
  const event = identity('event-1', 'event', [{
    type: 'organized_by', target_entity_id: club.id, target_record: null, evidence: [],
  }]);
  const unrelated = { ...identity('event-2', 'event'), name: club.name, aliases: [club.id], links: club.links };
  const entities = [club, event, unrelated];
  const outgoing = relatedIdentityNodes(event, entities);
  assert.equal(outgoing.length, 1);
  assert.equal(outgoing[0].label, 'Organized by');
  assert.equal(outgoing[0].entityId, club.id);
  const incoming = relatedIdentityNodes(club, entities);
  assert.equal(incoming.length, 1);
  assert.equal(incoming[0].label, 'Organizes event');
  assert.equal(incoming[0].entityId, event.id);
  assert.deepEqual(relatedIdentityNodes(unrelated, entities), []);
});

test('a catalog program faculty listing is shown as a listing, not a convenership', () => {
  const person = identity('person-1', 'person');
  const program = identity('program-1', 'program', [{
    type: 'listed_faculty', target_entity_id: person.id, target_record: null, evidence: [],
  }]);
  const [outgoing] = relatedIdentityNodes(program, [program, person]);
  assert.deepEqual([outgoing.label, outgoing.entityId, outgoing.section], ['Lists faculty', person.id, 'program']);
  const [incoming] = relatedIdentityNodes(person, [program, person]);
  assert.deepEqual([incoming.label, incoming.entityId], ['Listed faculty of', program.id]);
});

test('rooms place people and offices in a building, shown from both sides', () => {
  const building = identity('building-1', 'building');
  const person = identity('person-1', 'person', [{ type: 'office_at', target_entity_id: building.id, target_record: null, evidence: [] }]);
  const office = identity('office-1', 'office', [{ type: 'located_at', target_entity_id: building.id, target_record: null, evidence: [] }]);
  const [placed] = relatedIdentityNodes(person, [person, office, building]);
  assert.deepEqual([placed.label, placed.entityId, placed.kind], ['Office in', building.id, 'building']);
  const occupants = relatedIdentityNodes(building, [person, office, building]);
  assert.deepEqual(occupants.map(node => [node.label, node.entityId, node.detail]), [
    ['Office of', person.id, 'People identity'], ['Location of', office.id, 'Offices identity'],
  ]);
  assert.equal(defaultProfileSection('building'), 'building');
  assert.equal(sectionForCollection('buildings'), 'building');
});

test('programs and people are shown as part of their current school', () => {
  const school = identity('school-1', 'school');
  const program = identity('program-1', 'program', [{ type: 'part_of', target_entity_id: school.id, target_record: null, evidence: [] }]);
  const [placed] = relatedIdentityNodes(program, [program, school]);
  assert.deepEqual([placed.label, placed.entityId, placed.kind], ['Part of', school.id, 'school']);
  const [member] = relatedIdentityNodes(school, [program, school]);
  assert.deepEqual([member.label, member.entityId, member.detail], ['Includes', program.id, 'Academic program identity']);
  assert.equal(defaultProfileSection('school'), 'school');
  assert.equal(sectionForCollection('schools'), 'school');
  assert.equal(KIND_LABELS.school, 'Schools');
});

test('a missing organizer target remains evidence navigation rather than a guessed identity', () => {
  const event = identity('event-1', 'event', [{
    type: 'organized_by', target_entity_id: 'missing-club', target_record: null, evidence: [],
  }]);
  const [node] = relatedIdentityNodes(event, [event]);
  assert.equal(node.entityId, undefined);
  assert.equal(node.section, 'event');
  assert.equal(node.name, 'Related identity unavailable');
});

test('existing convener and undated catalog-course relationships retain their meaning', () => {
  const person = identity('person-1', 'person', [{
    type: 'profile_course', target_entity_id: null,
    target_record: { collection: 'courses', source_key: 'catalog', source_record_key: 'MUSI 101' }, evidence: [],
  }]);
  const program = identity('program-1', 'program', [{
    type: 'convener', target_entity_id: person.id, target_record: null, evidence: [],
  }]);
  const nodes = relatedIdentityNodes(person, [person, program]);
  assert.equal(nodes.find(node => node.section === 'courses').detail, 'Undated list · catalog link');
  const convener = nodes.find(node => node.entityId === program.id);
  assert.equal(convener.label, 'Convener of');
  assert.equal(convener.detail, 'Academic program identity');
  assert.equal(relatedIdentityNodes(program, [person, program])[0].label, 'Has convener');
});

test('graph expands explicit incoming relationships and preserves their exact source references', () => {
  const club = identity('club-1', 'club');
  const reference = { collection: 'events', source_key: 'archway-events', source_record_key: 'original:key', source_record_id: 'original-row', field: 'organizer_group_id', source_url: 'https://example.edu/event' };
  const event = identity('event-1', 'event', [{ type: 'organized_by', target_entity_id: club.id, target_record: null, evidence: [reference] }]);
  const sameName = { ...identity('unrelated', 'event'), name: club.name };
  const graph = identityNeighborhood([club, event, sameName], club.id, [club.id]);
  assert.deepEqual(graph.nodes.map(node => node.id), [club.id, event.id]);
  assert.equal(graph.edges.length, 1);
  assert.equal(graph.edges[0].from, event.id);
  assert.equal(graph.edges[0].to, club.id);
  assert.deepEqual(graph.edges[0].evidence, [reference]);
  assert.equal(graph.nodes.some(node => node.id === 'campus' || node.id.startsWith('kind:')), false);
});

test('record groups keep large menus compact while preserving all original keys', () => {
  const venue = identity('venue-1', 'venue');
  const keys = Array.from({ length: 900 }, (_, index) => `menu-${index}`);
  venue.links = [{ collection: 'menu', source_key: 'dining', source_record_keys: keys }];
  const graph = identityNeighborhood([venue], venue.id, [venue.id]);
  assert.equal(graph.nodes.length, 2);
  const source = graph.nodes.find(node => node.type === 'sources');
  assert.equal(source.count, 900);
  assert.deepEqual(source.links[0].source_record_keys, keys);
  assert.equal(source.section, 'menu');
  assert.equal(graph.edges[0].type, 'source');
});

test('shared catalog records have multiple evidenced edges without becoming identities', () => {
  const relation = { type: 'profile_course', target_entity_id: null, target_record: { collection: 'courses', source_key: 'catalog', source_record_key: 'MUSI 101' }, evidence: [{ collection: 'faculty', source_key: 'faculty', source_record_key: 'prof', field: 'courses' }] };
  const first = identity('person-1', 'person', [relation]);
  const second = identity('person-2', 'person', [relation]);
  const graph = identityNeighborhood([first, second], second.id, [second.id, first.id]);
  assert.equal(graph.nodes.filter(node => node.type === 'course').length, 1);
  assert.equal(graph.edges.filter(edge => edge.type === 'profile_course').length, 2);
  assert.equal(graph.nodes.filter(node => node.type === 'identity').length, 2);
});

test('neighborhood limits report omitted identities and record groups and retain the focus', () => {
  const club = identity('club-1', 'club');
  club.links = ['clubs', 'contacts', 'campus_hours'].map(collection => ({ collection, source_key: collection, source_record_keys: ['key'] }));
  const events = Array.from({ length: 12 }, (_, index) => identity(`event-${index}`, 'event', [{ type: 'organized_by', target_entity_id: club.id, target_record: null, evidence: [] }]));
  const graph = identityNeighborhood([club, ...events], club.id, [club.id], { identities: 3, records: 1 });
  assert.equal(graph.nodes[0].id, club.id);
  assert.equal(graph.nodes.filter(node => node.type === 'identity').length, 3);
  assert.equal(graph.omittedIdentities, 10);
  assert.equal(graph.omittedRecordGroups, 2);
  assert.equal(graph.edges.every(edge => graph.nodes.some(node => node.id === edge.from) && graph.nodes.some(node => node.id === edge.to)), true);
});

test('collapsing all expansions removes inferred neighbors and missing targets are reported', () => {
  const event = identity('event-1', 'event', [{ type: 'organized_by', target_entity_id: 'missing', target_record: null, evidence: [] }]);
  const graph = identityNeighborhood([event], event.id, [event.id]);
  assert.equal(graph.unavailableTargets, 1);
  assert.equal(graph.edges.length, 0);
  const collapsed = identityNeighborhood([event], event.id, []);
  assert.deepEqual(collapsed.nodes.map(node => node.id), [event.id]);
  assert.equal(collapsed.edges.length, 0);
  assert.equal(event.relationships.length, 1);
});

test('organizations behave like clubs: directory profile first, occurrence dates, no meal filter', () => {
  assert.equal(KIND_LABELS.organization, 'Organizations');
  assert.equal(defaultProfileSection('organization'), 'club');
  assert.deepEqual(profileSelectionFilters('organization', '2026-09-21', 'Dinner', ''), { date: '', meal: '' });
  const params = profileQueryParams('organization', 'release-a', '', 'Dinner');
  assert.equal(params.get('meal'), null);
  assert.equal(params.get('date'), null);
});
