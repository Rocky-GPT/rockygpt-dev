import assert from 'node:assert/strict';
import test from 'node:test';
import { collectionDescription, contactPreferenceText, detailSections, fieldLabel, isEmptyValue, nodeSummary, partitionFields } from '../lib/graph-presentation.ts';

const source = (id = 'contacts:one', overrides = {}) => ({ id, collection: 'contacts', row_id: id.split(':')[1],
  source_key: 'campus-directory', source_record_key: 'office:birch', source_url: 'https://example.edu/directory',
  collected_at: '2026-09-23T12:00:00Z', valid_from: null, valid_until: null, freshness: 'fresh', limitations: [], ...overrides });
const field = (label, value, options = {}) => {
  const evidence = source(options.sourceId, options.source);
  const assertion = { id: `assertion:${label}`, value, source_id: evidence.id, field_path: [label],
    publication_status: 'unspecified', limitations: [], ...options.assertion };
  return { id: `field:${label}`, label, kind: 'property', children: [],
    values: [{ value, assertion, source: evidence }] };
};
const entity = children => ({ id: 'birch', label: 'Birch Tree Inn', kind: 'entity', subtitle: 'venue', children });

test('only genuinely absent values move to empty fields; false, zero and structure remain visible', () => {
  const empty = [null, undefined, '', '  ', [], {}];
  for (const value of empty) assert.equal(isEmptyValue(value), true);
  for (const value of [false, 0, '0', [null], { unknown: null }]) assert.equal(isEmptyValue(value), false);
  const fields = [...empty, false, 0, [null], { unknown: null }].map((value, i) => field(`field${i}`, value));
  const root = entity(fields);
  const before = structuredClone(root);
  const result = partitionFields(root);
  assert.deepEqual(result.empty, fields.slice(0, empty.length));
  assert.deepEqual(result.details, fields.slice(empty.length));
  assert.deepEqual(root, before);
  for (const child of fields) assert.ok([...result.details, ...result.empty].some(found => found === child));
});

test('conflicts, unpublished values and assertion/source caveats never disappear into secondary sections', () => {
  const unpublished = field('allergens', [], { assertion: { publication_status: 'not_published' } });
  const qualified = field('hours', null, { assertion: { limitations: ['Current applicability is unverified.'] } });
  const sourceCaveat = field('office', null, { source: { limitations: ['Original source record unavailable.'] } });
  const stale = field('status', null, { source: { freshness: 'stale' } });
  const conflicting = field('name', 'Birch Tree Inn');
  conflicting.values.push(field('name', 'Another source name', { sourceId: 'contacts:two' }).values[0]);
  const agreeingEmpty = field('title', null);
  agreeingEmpty.values.push(field('title', null, { sourceId: 'contacts:two' }).values[0]);
  const missingSource = field('telephone', null);
  missingSource.values[0].source = undefined;
  const fields = [unpublished, qualified, sourceCaveat, stale, conflicting, agreeingEmpty, missingSource];
  const result = partitionFields(entity(fields));
  assert.deepEqual(result.details, fields);
  assert.deepEqual(result.empty, []);
  assert.deepEqual(result.sourceFields, []);
  assert.strictEqual(result.details[4].values[1].source, conflicting.values[1].source);
  assert.deepEqual(result.details[4].values.map(value => value.assertion.source_id), ['contacts:one', 'contacts:two']);
  assert.deepEqual(result.details[1].values[0].assertion.limitations, ['Current applicability is unverified.']);
});

test('canonical entity kind stays separate from contact source record type and repeated name', () => {
  const name = field('name', 'Birch Tree Inn');
  const type = field('type', 'office');
  const root = entity([name, type, field('prefers_email', false)]);
  assert.equal(root.subtitle, 'venue');
  assert.equal(fieldLabel(type), 'Source record type');
  assert.equal(fieldLabel(root.children[2]), 'Email preference');
  assert.deepEqual(partitionFields(root).sourceFields, [name, type]);
  const unrelatedType = field('type', 'elective', { source: { collection: 'requirement_groups' } });
  assert.equal(fieldLabel(unrelatedType), 'Type');
  assert.deepEqual(partitionFields(entity([unrelatedType])).details, [unrelatedType]);
  const qualifiedType = field('type', 'office', { assertion: { limitations: ['Source categorization differs.'] } });
  assert.deepEqual(partitionFields(entity([qualifiedType])).details, [qualifiedType]);
  assert.deepEqual(partitionFields(entity([field('name', 'Alternate published name')])).details.map(node => node.label), ['name']);
});

test('contact email flag is explained without interpreting unrelated false values as missing', () => {
  const unspecified = field('prefers_email', false);
  assert.equal(contactPreferenceText(unspecified.values[0]), 'Preference not specified');
  assert.equal(contactPreferenceText(field('prefers_email', true).values[0]), 'Email note present');
  assert.equal(contactPreferenceText(field('vegan', false, { source: { collection: 'menu' } }).values[0]), undefined);
  assert.equal(contactPreferenceText(field('prefers_email', false, { source: { collection: 'other' } }).values[0]), undefined);
  assert.equal(contactPreferenceText(field('prefers_email', false, { assertion: { field_path: ['nested', 'prefers_email'] } }).values[0]), undefined);
  assert.equal(unspecified.values[0].value, false);
  assert.equal(unspecified.values[0].assertion.value, false);
  assert.deepEqual(partitionFields(entity([unspecified])).details, [unspecified]);
});

test('contact cards retain both original scalar and structured fields without equating their values', () => {
  const phone = field('phone', '(201) 555-0100');
  const phones = field('phones', [{ number: '201-555-0100' }, { number: '201-555-0199' }]);
  const office = field('office', 'ASB-107');
  const offices = field('offices', ['ASB-107', 'Different location']);
  const bio = field('bio', 'Biography', { source: { collection: 'faculty' } });
  const link = field('profile_url', 'https://example.edu/faculty', { assertion: { field_path: ['profileUrl'] }, source: { collection: 'faculty' } });
  const root = entity([phones, bio, office, link, phone, offices]);
  const before = structuredClone(root);
  const sections = detailSections(root, root.children);
  assert.deepEqual(sections.map(section => section.label), ['Contact', 'Academic profile', 'Links']);
  const cards = sections.flatMap(section => section.cards);
  assert.strictEqual(cards.find(card => card.field === phone).related[0], phones);
  assert.strictEqual(cards.find(card => card.field === office).related[0], offices);
  assert.deepEqual(cards.flatMap(card => [card.field, ...card.related]).map(node => node.id).sort(), root.children.map(node => node.id).sort());
  assert.deepEqual(root, before);
  assert.equal(phones.values[0].value[1].number, '201-555-0199');
  assert.equal(offices.values[0].value[1], 'Different location');
});

test('unmatched, empty, nested and unrelated fields are not folded into contact representations', () => {
  const phones = field('phones', [{ number: '201-555-0100' }]);
  for (const root of [entity([phones]), entity([field('phone', null), phones]), entity([field('phone', '201-555-0100', { source: { collection: 'other' } }), phones]),
    { ...entity([field('phone', '201-555-0100'), phones]), kind: 'record' }]) {
    const sections = detailSections(root, root.children);
    assert.equal(sections.flatMap(section => section.cards).length, root.children.length);
    assert.ok(sections.flatMap(section => section.cards).every(card => card.related.length === 0));
  }
});

test('collection descriptions explain record units while summaries preserve counts and pending pages', () => {
  const record = { id: 'one', label: 'Repeated dish', kind: 'record', subtitle: 'meal: Breakfast · valid from: 2026-09-23', children: [] };
  const group = { id: 'menu', label: 'Menu offerings', kind: 'group', subtitle: '100 of 874 records', pending: true, children: [record] };
  assert.equal(collectionDescription(group), 'Entries across dates, meals and stations; dishes may repeat.');
  assert.equal(collectionDescription({ ...group, label: 'Dining hours' }), 'Schedule records across meals, weekdays and validity periods. Open a record to check applicability.');
  assert.equal(collectionDescription({ ...group, label: 'Future record type' }), 'Open to explore individual records and their sources.');
  assert.equal(collectionDescription(record), 'Open to explore individual records and their sources.');
  assert.equal(nodeSummary(group), '100 of 874 records · Loading more records…');
  assert.equal(nodeSummary({ ...group, subtitle: '1 of 2 records', pending: false }), '1 of 2 records');
  assert.equal(nodeSummary({ ...group, subtitle: '0 of 0 records', pending: false, children: [] }), '0 of 0 records');
  assert.equal(nodeSummary({ ...group, subtitle: undefined, pending: false }), '1 loaded record');
  assert.equal(nodeSummary(record), record.subtitle);
  assert.equal(nodeSummary(field('calories', 0)), '0');
  assert.equal(nodeSummary(field('vegan', false)), 'false');
  assert.equal(nodeSummary(field('allergens', [])), 'Empty list');
});

test('field partitioning leaves relationship navigation, record identity and evidence untouched', () => {
  const relationship = { id: 'edge', label: 'Dining Services', kind: 'relationship', subtitle: 'part of', children: [],
    target: { id: 'office', name: 'Dining Services', kind: 'office', aliases: [] },
    relationship: { id: 'published-edge', evidence: [{ source_record_id: 'original-row', field: 'office_id' }] } };
  const group = { id: 'group', label: 'Menu offerings', kind: 'group', children: [
    { id: 'breakfast', label: 'Same dish', kind: 'record', children: [] },
    { id: 'lunch', label: 'Same dish', kind: 'record', children: [] },
  ] };
  const root = entity([field('phone', '201-555-0100'), relationship, group]);
  const before = structuredClone(root);
  const result = partitionFields(root);
  assert.equal(result.details.length, 1);
  assert.deepEqual(root, before);
  assert.strictEqual(root.children[1], relationship);
  assert.deepEqual(root.children[2].children.map(node => node.id), ['breakfast', 'lunch']);
});
