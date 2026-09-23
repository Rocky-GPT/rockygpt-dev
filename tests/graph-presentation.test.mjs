import assert from 'node:assert/strict';
import test from 'node:test';
import { collectionDescription, detailSections, fieldLabel, isEmptyValue, nodeSummary, partitionFields } from '../lib/graph-presentation.ts';

const field = (label, value, options = {}) => {
  const source = { id: options.sourceId ?? 'contacts:one', collection: 'contacts', row_id: 'one', source_key: 'directory', source_record_key: 'birch',
    source_url: 'https://example.edu', collected_at: null, valid_from: null, valid_until: null, freshness: 'fresh', limitations: [], ...options.source };
  const assertion = { id: `assertion:${label}`, value, source_id: source.id, field_path: [label], publication_status: 'unspecified', limitations: [], ...options.assertion };
  const values = [{ value, assertion, source }];
  return { id: `field:${label}`, label, propertyKey: label, kind: 'property', children: [], category: options.category ?? 'details', status: options.status ?? 'known', values,
    factValues: [{ id: `value:${label}`, value: Object.hasOwn(options, 'canonical') ? options.canonical : value, assertions: values,
      assertion_ids: [assertion.id], supporting_evidence_ids: [source.id], evidence_count: 1, valid_from: null, valid_until: null }] };
};
const entity = children => ({ id: 'birch', label: 'Birch Tree Inn', kind: 'entity', subtitle: 'venue', children });

test('only backend-unknown empty values move to secondary fields; known empty lists, false and zero stay visible', () => {
  for (const value of [null, undefined, '', '  ', [], {}]) assert.equal(isEmptyValue(value), true);
  for (const value of [false, 0, '0', [null], { unknown: null }]) assert.equal(isEmptyValue(value), false);
  const empty = [null, '', [], {}].map((value, i) => field(`empty${i}`, value, { status: 'unknown' }));
  const known = [false, 0, [], {}, [null], { unknown: null }].map((value, i) => field(`known${i}`, value));
  const root = entity([...empty, ...known]), before = structuredClone(root);
  assert.deepEqual(partitionFields(root).empty, empty);
  assert.deepEqual(partitionFields(root).details, known);
  assert.deepEqual(root, before);
  assert.strictEqual(partitionFields(root).details[0], known[0]);
});

test('backend conflicts, temporal variants and evidence caveats remain visible', () => {
  const fields = [field('conflict', null, { status: 'conflicting' }), field('periods', null, { status: 'multiple' }),
    field('unpublished', null, { status: 'unknown', assertion: { publication_status: 'not_published' } }),
    field('qualified', null, { status: 'unknown', assertion: { limitations: ['Applicability is uncertain.'] } }),
    field('source-caveat', null, { status: 'unknown', source: { limitations: ['Original record unavailable.'] } }),
    field('stale', null, { status: 'unknown', source: { freshness: 'stale' } })];
  const missing = field('missing', null, { status: 'unknown' }); missing.values[0].source = undefined; fields.push(missing);
  assert.deepEqual(partitionFields(entity(fields)).details, fields);
  assert.deepEqual(partitionFields(entity(fields)).empty, []);
});

test('labels and canonical values come from the backend, with raw parser values retained only as evidence', () => {
  const name = field('name', 'Birch Tree Inn');
  const type = field('Source record type', 'office');
  const preference = field('Email preference', false, { status: 'unknown', category: 'contact', canonical: null });
  const root = entity([name, type, preference]);
  assert.equal(root.subtitle, 'venue');
  assert.equal(fieldLabel(type), 'Source record type');
  assert.equal(fieldLabel(preference), 'Email preference');
  assert.equal(nodeSummary(preference), 'No value provided');
  assert.equal(preference.values[0].assertion.value, false);
  assert.deepEqual(partitionFields(root).sourceFields, [name]);
  assert.deepEqual(partitionFields(root).empty, [preference]);
  assert.equal(nodeSummary(field('Other boolean', false)), 'false');
});

test('detail sections obey backend categories without merging or reclassifying source fields', () => {
  const phone = field('Phone', '201-555-0100', { category: 'details' });
  const phones = field('Phones', [{ number: '201-555-0100' }], { category: 'contact' });
  const bio = field('Biography', 'A profile', { category: 'academic' });
  const link = field('Profile', 'https://example.edu/profile', { category: 'links' });
  const root = entity([phones, bio, phone, link]), before = structuredClone(root);
  const sections = detailSections(root, root.children);
  assert.deepEqual(sections.map(section => section.label), ['Contact', 'Academic profile', 'Details', 'Links']);
  assert.strictEqual(sections[2].cards[0].field, phone);
  assert.deepEqual(sections.flatMap(section => section.cards).map(card => card.field), root.children);
  assert.deepEqual(root, before);
  assert.equal(detailSections({ ...root, kind: 'record' }, root.children)[0].label, 'Contact');
  assert.equal(detailSections(phones, [phone])[0].label, 'Values');
});

test('record descriptions preserve exact loading totals and contextual subtitles', () => {
  const record = { id: 'one', label: 'Repeated dish', kind: 'record', subtitle: 'meal: Breakfast · date: 2026-09-23', children: [] };
  const group = { id: 'menu', label: 'Menu offerings', kind: 'group', subtitle: '100 of 874 records', pending: true, children: [record] };
  assert.equal(collectionDescription(group), 'Entries across dates, meals and stations; dishes may repeat.');
  assert.match(collectionDescription({ ...group, label: 'Dining hours' }), /validity periods/);
  assert.equal(collectionDescription({ ...group, label: 'Other' }), 'Open to explore individual records and their sources.');
  assert.equal(nodeSummary(group), '100 of 874 records · Loading more records…');
  assert.equal(nodeSummary({ ...group, subtitle: '1 of 2 records', pending: false }), '1 of 2 records');
  assert.equal(nodeSummary(record), record.subtitle);
  assert.equal(nodeSummary(field('calories', 0)), '0');
});

test('presentation leaves relationship targets, evidence and repeated record identities untouched', () => {
  const edge = { id: 'edge', label: 'Dining Services', kind: 'relationship', children: [], target: { id: 'office' }, relationship: { id: 'published-edge', evidence: [{ field: 'office_id' }] } };
  const group = { id: 'group', label: 'Menu offerings', kind: 'group', children: [{ id: 'breakfast', label: 'Same dish' }, { id: 'lunch', label: 'Same dish' }] };
  const root = entity([field('Phone', '201-555-0100'), edge, group]), before = structuredClone(root);
  assert.equal(partitionFields(root).details.length, 1);
  assert.deepEqual(root, before);
  assert.strictEqual(root.children[1], edge);
  assert.deepEqual(group.children.map(node => node.id), ['breakfast', 'lunch']);
});
