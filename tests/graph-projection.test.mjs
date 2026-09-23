import assert from 'node:assert/strict';
import test from 'node:test';
import { appendProjectionPage, findAttachment, hasChildren, parseProjection, projectionTree, readProjection, valueText } from '../lib/graph-projection.ts';
import { CAMPUS, traverse } from '../lib/knowledge-graph.ts';

const entity = { id: 'venue', name: 'Dining location', kind: 'venue', aliases: [] };
const club = { id: 'club', name: 'A club', kind: 'club', aliases: [] };
const graph = { dataset_version: 'release-1', identity_hash: 'hash-1', nodes: [entity, club], edges: [], diagnostics: [] };
const source = (id) => ({ id, collection: 'menu', row_id: id.replace('menu:', ''), source_key: 'source', source_record_key: 'original-key', source_url: 'https://example.org/source', artifact_key: null, artifact_path: null, collected_at: null, valid_from: '2026-09-22', valid_until: '2026-09-22', freshness: 'unknown', limitations: ['Source applicability is unresolved.'] });
const assertion = (id, value, sourceId = 'menu:root') => ({ id, value, source_id: sourceId, field_path: ['calories'], limitations: ['Dietary field not published.'], publication_status: 'not_published' });
const prop = (key, value, id = key, sourceId = 'menu:root') => ({ key, label: key, value_type: 'text', assertions: [assertion(id, value, sourceId)] });
const record = (id, meal) => ({ id, label: 'Same dish', record_type: 'menu_offerings', source_id: `menu:${id}`, context: [prop('meal', meal, `${id}-meal`, `menu:${id}`)], properties: [prop('calories', 0, `${id}-calories`, `menu:${id}`), prop('vegan', false, `${id}-vegan`, `menu:${id}`), prop('allergens', [], `${id}-allergens`, `menu:${id}`)], relationships: [] });
const relationship = { id: 'edge', subject: { kind: 'entity', entity_id: 'venue' }, predicate: 'part_of', target_entity_id: 'club', direction: 'outgoing', evidence: [{ collection: 'source', source_key: 'key', source_record_key: 'record', source_record_id: 'pinned-row', field: 'explicit_id' }], registry_locator: { identity_hash: 'hash-1', entity_id: 'venue', relationship_index: 0 } };
function fixture() {
  return { schema_version: 2, projection_version: 'mapping-2', dataset_version: 'release-1', identity_hash: 'hash-1', entity: structuredClone(entity), selected_record_group: null, properties_complete: true,
    properties: [prop('name', 'Dining location')], relationships: [structuredClone(relationship)], sources: [source('menu:root'), source('menu:one')], coverage: [],
    record_groups: [{ key: 'menu', label: 'Menu offerings', record_type: 'menu_offerings', records: [record('one', 'Breakfast')], total: 2, returned: 1, next_cursor: 'opaque-1', filters: { date: '2026-09-22', meal: null }, filter_fields: ['date', 'meal'], ordering: 'published record order' }] };
}
function continuation(current) {
  return { ...structuredClone(current), properties: [], properties_complete: false, selected_record_group: 'menu', sources: [source('menu:two')], record_groups: [{ ...structuredClone(current.record_groups[0]), records: [record('two', 'Lunch')], returned: 1, next_cursor: null }] };
}

test('record pages preserve repeated labels, boundaries, root assertions, edges and exact provenance', () => {
  const first = fixture(), before = structuredClone(first);
  const merged = appendProjectionPage(first, continuation(first), first.record_groups[0]);
  assert.deepEqual(first, before);
  assert.strictEqual(merged.properties, first.properties);
  assert.strictEqual(merged.relationships, first.relationships);
  const root = projectionTree(merged, graph);
  const group = root.children.find(n => n.kind === 'group');
  assert.equal(group.children.length, 2);
  assert.equal(group.subtitle, '2 of 2 records');
  assert.notEqual(group.children[0].id, group.children[1].id);
  assert.match(group.children[0].subtitle, /Breakfast/);
  assert.match(group.children[1].subtitle, /Lunch/);
  assert.equal(root.children.filter(n => n.kind === 'property').length, 1);
  const calories = group.children[0].children.find(n => n.label === 'calories');
  assert.equal(calories.values[0].value, 0);
  // Each value carries its own caveats and the one source record it names.
  assert.deepEqual(calories.values[0].source, source('menu:one'));
  assert.deepEqual(calories.values[0].assertion.limitations, ['Dietary field not published.']);
  assert.equal(calories.values[0].assertion.publication_status, 'not_published');
  assert.deepEqual(group.children[1].children.find(n => n.label === 'calories').values[0].source, source('menu:two'));
  assert.deepEqual(merged.sources.map(s => s.id), ['menu:root', 'menu:one', 'menu:two']);
  assert.equal(findAttachment(root, calories.id), calories);
});

test('leaf semantics preserve false, null, empty containers, conflicts and structured descendants', () => {
  const p = fixture();
  p.properties = [prop('false', false), prop('zero', 0), prop('null', null), prop('empty', ''), prop('list', []), prop('object', {}), prop('structured', { nested: ['a', 'b'] }), { ...prop('conflict', 'first'), assertions: [assertion('a', 'first'), assertion('b', 'second')] }];
  const root = projectionTree(p, graph);
  for (const label of ['false', 'zero', 'null', 'empty', 'list', 'object', 'conflict']) assert.equal(hasChildren(root.children.find(n => n.label === label)), false);
  const conflict = root.children.find(n => n.label === 'conflict');
  assert.deepEqual(conflict.values.map(v => v.value), ['first', 'second']);
  const structured = root.children.find(n => n.label === 'structured');
  assert.equal(hasChildren(structured), true);
  assert.equal(structured.children[0].children[1].values[0].value, 'b');
  assert.deepEqual([false, 0, null, '', [], {}].map(valueText), ['false', '0', 'Not published', 'Empty value', 'Empty list', 'Empty object']);
});

test('unknown record types and record-to-entity relationships work with the same tree', () => {
  const p = fixture();
  const course = { id: 'course', name: 'Example course', kind: 'course', aliases: [] };
  p.record_groups = [{ ...p.record_groups[0], key: 'rules', label: 'Requirement groups', record_type: 'requirement_group', total: 1, next_cursor: null,
    records: [{ id: 'rule-1', label: 'Electives', record_type: 'requirement_group', context: [prop('rule', 'Choose one')], properties: [prop('text', 'Published requirement')], relationships: [{ ...relationship, predicate: 'requires', target_entity_id: course.id, subject: { kind: 'record', record_id: 'rule-1' } }] }] }];
  const root = projectionTree(p, { ...graph, nodes: [...graph.nodes, course] });
  const group = root.children.find(n => n.kind === 'group');
  const rule = group.children[0];
  const edge = rule.children.find(n => n.kind === 'relationship');
  assert.equal(edge.target.id, course.id);
  assert.equal(edge.subtitle, 'requires');
  assert.equal(edge.relationship.subject.record_id, 'rule-1');
  assert.deepEqual(edge.relationship.evidence, relationship.evidence);
  let path = traverse([CAMPUS], entity);
  path.push({ type: 'attachment', entityId: entity.id, nodeId: group.id, label: group.label }, { type: 'attachment', entityId: entity.id, nodeId: rule.id, label: rule.label });
  path = traverse(path, edge.target, edge.subtitle);
  assert.deepEqual(path.map(s => s.label), ['Ramapo College', 'Dining location', 'Requirement groups', 'Electives', 'Example course']);
  assert.equal(path.at(-1).via, 'requires');
  assert.equal(findAttachment(root, path.at(-2).nodeId), rule);
});

test('incoming edges follow original subjects; unresolved IDs and plain names never create links', () => {
  const p = fixture(); p.entity = club; p.relationships[0].direction = 'incoming';
  p.properties.push(prop('organizer', 'Dining location'));
  let root = projectionTree(p, graph);
  assert.equal(root.children[0].target.id, entity.id);
  assert.equal(root.children[0].subtitle, 'contains');
  assert.deepEqual(root.children[0].relationship, p.relationships[0]);
  assert.equal(root.children.find(n => n.label === 'organizer').target, undefined);
  root = projectionTree(p, { ...graph, nodes: [club] });
  assert.equal(root.children[0].target, undefined);
  assert.equal(hasChildren(root.children[0]), false);
});

test('continuations reject changes to release, entity, mapping, groups, filters and ordering', () => {
  const p = fixture();
  for (const key of ['dataset_version', 'identity_hash', 'projection_version']) {
    const page = continuation(p); page[key] = 'changed';
    assert.throws(() => appendProjectionPage(p, page, p.record_groups[0]), e => e.reload === true);
  }
  const other = continuation(p); other.entity.id = 'other';
  assert.throws(() => appendProjectionPage(p, other, p.record_groups[0]), e => e.reload);
  for (const [key, value] of [['key', 'other'], ['total', 999], ['filters', {}], ['ordering', 'different'], ['next_cursor', 'opaque-1'], ['record_type', 'other']]) {
    const page = continuation(p); page.record_groups[0][key] = value;
    assert.throws(() => appendProjectionPage(p, page, p.record_groups[0]));
  }
  const duplicate = continuation(p); duplicate.record_groups[0].records[0].id = 'one';
  assert.throws(() => appendProjectionPage(p, duplicate, p.record_groups[0]), /repeated/);
});

test('missing records remain visible as incomplete coverage even after the final cursor', () => {
  const p = fixture(), page = continuation(p);
  page.record_groups[0].records = []; page.record_groups[0].returned = 0;
  page.coverage = [{ reason: 'record_unavailable', record_id: 'two', collection: 'menu', fields: [], detail: null }];
  const merged = appendProjectionPage(p, page, p.record_groups[0]);
  assert.equal(merged.record_groups[0].records.length, 1);
  assert.equal(merged.record_groups[0].total, 2);
  assert.equal(merged.coverage[0].reason, 'record_unavailable');
});

test('contract validation rejects unsupported versions, malformed records and missing provenance', () => {
  assert.deepEqual(parseProjection(fixture()), fixture());
  for (const mutate of [p => p.schema_version = 1, p => p.properties[0].assertions[0].field_path = [], p => delete p.properties[0].assertions[0].source_id, p => p.sources[0].freshness = 'current', p => delete p.sources, p => delete p.record_groups[0].records[0].source_id, p => p.record_groups[0].records[0].context = null, p => p.record_groups[0].returned = 12, p => p.relationships[0].subject = { kind: 'name', name: 'Dining location' }]) {
    const p = fixture(); mutate(p); assert.throws(() => parseProjection(p), /not supported/);
  }
  for (const mutate of [p => p.properties[0].assertions[0].source_id = 'menu:unlisted', p => p.record_groups[0].records[0].source_id = 'menu:unlisted', p => p.sources.push(source('menu:one'))]) {
    const p = fixture(); mutate(p); assert.throws(() => parseProjection(p), /listed source record/);
  }
  const repeated = fixture();
  repeated.record_groups[0].records.push(structuredClone(repeated.record_groups[0].records[0]));
  repeated.record_groups[0].returned = 2;
  assert.throws(() => parseProjection(repeated), /repeated/);
});

test('requests pin release/hash/entity/page size and use opaque group cursors with exact filters', async () => {
  const p = fixture();
  const fetcher = async (url, options) => {
    const query = new URL(url, 'http://localhost').searchParams;
    assert.equal(query.get('entity_id'), entity.id); assert.equal(query.get('dataset_version'), graph.dataset_version);
    assert.equal(query.get('identity_hash'), graph.identity_hash); assert.equal(query.get('limit'), '100');
    assert.equal(query.get('record_group'), 'menu'); assert.equal(query.get('cursor'), 'opaque-1');
    assert.deepEqual(JSON.parse(query.get('filters')), p.record_groups[0].filters);
    assert.equal(options.cache, 'no-store'); assert.ok(options.signal);
    return Response.json(continuation(p));
  };
  await readProjection(graph, entity.id, new AbortController().signal, p.record_groups[0], fetcher);
});

test('409 and mismatched identity require reload, while unavailable or invalid responses can be retried', async () => {
  const signal = new AbortController().signal;
  await assert.rejects(readProjection(graph, entity.id, signal, undefined, async () => new Response('', { status: 409 })), e => e.reload);
  const wrong = fixture(); wrong.identity_hash = 'other';
  await assert.rejects(readProjection(graph, entity.id, signal, undefined, async () => Response.json(wrong)), e => e.reload);
  await assert.rejects(readProjection(graph, entity.id, signal, undefined, async () => new Response('', { status: 404 })), e => e.reload === false);
  await assert.rejects(readProjection(graph, entity.id, signal, undefined, async () => Response.json({})), e => e.reload === false);
  const cancelled = new AbortController(); cancelled.abort();
  await assert.rejects(readProjection(graph, entity.id, cancelled.signal, undefined, async (_url, options) => { options.signal.throwIfAborted(); }), /abort/i);
});
