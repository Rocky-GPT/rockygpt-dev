import assert from 'node:assert/strict';
import test from 'node:test';
import { groupConnections } from '../lib/graph-connection-groups.ts';

const connection = (id, predicate = 'part_of', direction = 'outgoing', subtitle = 'part of') => ({
  id, label: 'School of Humanities', kind: 'relationship', subtitle, children: [],
  target: { id: 'school:one', name: 'School of Humanities', kind: 'school', aliases: [] },
  relationship: { id: `relationship:${id}`, predicate, direction, target_entity_id: 'school:one',
    subject: { kind: 'entity', entity_id: 'program:one' },
    evidence: [{ collection: 'programs', source_record_key: id, field: 'school', source_url: `https://example.edu/${id}` }],
    registry_locator: { identity_hash: 'release:one', entity_id: 'program:one', relationship_index: 0 } },
});

test('predicate and direction define groups, with first-seen group and edge order preserved', () => {
  const outgoing = connection('one');
  const incoming = connection('two', 'part_of', 'incoming', 'contains');
  const convener = connection('three', 'convener', 'outgoing', 'has convener');
  const outgoingAgain = connection('four');
  const groups = groupConnections([outgoing, incoming, convener, outgoingAgain]);
  assert.equal(groups.length, 3);
  assert.deepEqual(groups.map(group => group.label), ['part of', 'contains', 'has convener']);
  assert.deepEqual(groups.map(group => group.nodes.map(node => node.id)), [['one', 'four'], ['two'], ['three']]);
  assert.notEqual(groups[0].key, groups[1].key);
  assert.strictEqual(groups[0].nodes[0], outgoing);
  assert.strictEqual(groups[0].nodes[1], outgoingAgain);
});

test('colliding human labels never combine different predicates or directions', () => {
  const first = connection('one', 'custom_predicate', 'outgoing', 'Same label');
  const second = connection('two', 'custom predicate', 'outgoing', 'Same label');
  const incoming = connection('three', 'custom_predicate', 'incoming', 'Same label');
  const differentLabel = connection('four', 'custom_predicate', 'outgoing', 'Different label');
  const groups = groupConnections([first, second, incoming, differentLabel]);
  assert.equal(groups.length, 3);
  assert.equal(new Set(groups.map(group => group.key)).size, 3);
  assert.deepEqual(groups[0].nodes, [first, differentLabel]);
  assert.equal(groups[0].label, 'Same label');
});

test('repeated target links retain separate edge IDs, provenance and evidence', () => {
  const first = connection('one');
  const second = connection('two');
  second.relationship.registry_locator.relationship_index = 1;
  const [group] = groupConnections([first, second, first]);
  assert.equal(group.nodes.length, 3);
  assert.deepEqual(group.nodes.map(node => node.relationship.id), ['relationship:one', 'relationship:two', 'relationship:one']);
  assert.strictEqual(group.nodes[0].relationship.evidence, first.relationship.evidence);
  assert.strictEqual(group.nodes[1].relationship.evidence, second.relationship.evidence);
  assert.equal(group.nodes[1].relationship.registry_locator.relationship_index, 1);
  assert.strictEqual(group.nodes[2], first);
});

test('metadata-free relationship nodes remain separate and ordinary attachments are ignored', () => {
  const missing = { id: 'missing', label: 'Unknown target', kind: 'relationship', subtitle: 'part of', children: [] };
  const known = connection('known');
  const property = { id: 'property', label: 'part of', kind: 'property', children: [] };
  const record = { id: 'record', label: 'part of', kind: 'record', children: [] };
  const groups = groupConnections([missing, property, known, record, missing]);
  assert.equal(groups.length, 3);
  assert.equal(new Set(groups.map(group => group.key)).size, 3);
  assert.deepEqual(groups.map(group => group.nodes), [[missing], [known], [missing]]);
  assert.equal(groupConnections([{ ...missing, subtitle: undefined }])[0].label, 'Relationship');
  assert.equal(groupConnections([{ ...known, subtitle: undefined }])[0].label, 'part of');
});

test('frozen input remains untouched and group arrays are independently allocated', () => {
  const freeze = value => {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  };
  const nodes = freeze([connection('one'), connection('two')]);
  const groups = groupConnections(nodes);
  assert.strictEqual(groups[0].nodes[0], nodes[0]);
  assert.strictEqual(groups[0].nodes[1], nodes[1]);
  assert.notStrictEqual(groups[0].nodes, nodes);
  assert.notStrictEqual(groupConnections(nodes)[0].nodes, groups[0].nodes);
  assert.deepEqual(groupConnections([]), []);
});
