import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCampusGraphExport } from '../lib/campus-graph-export.ts';

const exportedAt = '2026-09-22T04:00:00.000Z';
const ref = (key, id) => ({ collection: 'courses', source_key: 'catalog & / #', source_record_key: key, ...(id ? { source_record_id: id } : {}) });
const evidence = (field = 'courses[0]') => ({ collection: 'faculty', source_key: 'faculty', source_record_key: 'Professor Example', field, source_url: 'https://example.edu/faculty?x=1&y=2' });
const entity = (id, kind = 'person') => ({ id, kind, name: `Name ${id}`, aliases: [`Alias ${id}`, 'Alias with / ? & #'], links: [], relationships: [] });
const snapshot = identities => ({
  dataset_version: 'snapshot / with ? punctuation', identity_hash: 'original-identity-hash', campus_date: '2026-09-21', identities,
  coverage: { identity_count: identities.length, identities_by_kind: {}, linked_records: {}, relationships: {}, unresolved: [] },
});

test('export uses every loaded identity, link, relationship and unresolved issue beyond display limits', () => {
  const identities = Array.from({ length: 35 }, (_, i) => entity(`person-${i}`));
  identities[0].links = Array.from({ length: 22 }, (_, i) => ({ collection: 'contacts', source_key: 'directory', source_record_keys: [`contact-${i}`] }));
  identities[0].relationships = Array.from({ length: 24 }, (_, i) => ({ type: 'convener', target_entity_id: identities[i + 1].id, evidence: [evidence(`conveners[${i}]`)] }));
  const index = snapshot(identities);
  index.coverage.unresolved = Array.from({ length: 75 }, (_, i) => ({ collection: 'courses', record: `Unlinked ${i}`, reason: 'No published identifier.' }));
  const result = buildCampusGraphExport(index, exportedAt);
  assert.equal(result.counts.published_identities, 35);
  assert.equal(result.counts.aliases, 70);
  assert.equal(result.nodes.filter(node => node.type === 'identity' && node.status === 'published').length, 35);
  assert.equal(result.edges.filter(edge => edge.type === 'source_link').length, 22);
  assert.equal(result.edges.filter(edge => edge.type === 'evidence_relationship').length, 24);
  assert.deepEqual(result.coverage, index.coverage);
  assert.equal(result.counts.unresolved_issues, 75);
  for (const identity of identities) {
    const node = result.nodes.find(node => node.id === `identity:${identity.id}`);
    assert.equal(node.entity_id, identity.id);
    assert.deepEqual(node.aliases, identity.aliases);
    assert.equal('links' in node, false);
    assert.equal('relationships' in node, false);
  }
});

test('repeated source-link groups preserve independent key and ID arrays exactly', () => {
  const owner = entity('owner / : &');
  const link = { collection: 'events', source_key: 'calendar / ? #', source_record_keys: ['repeated', 'repeated', 'other'], source_record_ids: ['row-b', 'row-a'] };
  owner.links = [structuredClone(link), structuredClone(link)];
  const result = buildCampusGraphExport(snapshot([owner]), exportedAt);
  const edges = result.edges.filter(edge => edge.type === 'source_link');
  assert.equal(edges.length, 2);
  assert.equal(new Set(edges.map(edge => edge.id)).size, 2);
  assert.equal(result.counts.source_link_groups, 2);
  assert.equal(result.counts.source_record_key_entries, 6);
  assert.equal(result.counts.source_record_id_entries, 4);
  for (const [index, edge] of edges.entries()) {
    assert.equal(edge.from, `identity:${owner.id}`);
    assert.equal(edge.source_link_index, index);
    assert.deepEqual(result.nodes.find(node => node.id === edge.to).selector, link);
  }
  assert.match(result.semantics.source_link, /never zip/);
});

test('directed relationships retain each occurrence, exact target and exact evidence', () => {
  const program = entity('program', 'program');
  const person = entity('person');
  const club = entity('club', 'club');
  const event = entity('event', 'event');
  program.relationships = Array.from({ length: 2 }, () => ({ type: 'convener', target_entity_id: person.id, evidence: [evidence('convener')] }));
  event.relationships = [{ type: 'organized_by', target_entity_id: club.id, target_record: null, evidence: [{ ...evidence('organizer_group_id'), collection: 'events', source_record_id: 'occurrence-id' }] }];
  person.relationships = [{ type: 'profile_course', target_record: ref('CMPS 147 / A&B', 'catalog-row'), evidence: [evidence()] }];
  const index = snapshot([program, person, club, event]);
  const result = buildCampusGraphExport(index, exportedAt);
  const relationships = result.edges.filter(edge => edge.type === 'evidence_relationship');
  assert.equal(relationships.length, 4);
  for (const identity of index.identities) identity.relationships.forEach((relationship, i) => {
    const edge = relationships.find(edge => edge.from === `identity:${identity.id}` && edge.relationship_index === i);
    assert.equal(edge.relationship_type, relationship.type);
    assert.deepEqual(edge.evidence, relationship.evidence);
    for (const key of ['target_entity_id', 'target_record']) {
      assert.equal(Object.hasOwn(edge, key), Object.hasOwn(relationship, key));
      if (Object.hasOwn(relationship, key)) assert.deepEqual(edge[key], relationship[key]);
    }
  });
  assert.equal(relationships.filter(edge => edge.from === 'identity:person' && edge.to === 'identity:program').length, 0);
  const courseEdge = relationships.find(edge => edge.relationship_type === 'profile_course');
  assert.equal(courseEdge.temporal_scope, 'undated_profile_list');
  assert.equal(courseEdge.target_status, 'record_reference');
  assert.deepEqual(result.nodes.find(node => node.id === courseEdge.to).selector, person.relationships[0].target_record);
  assert.match(result.semantics.profile_course, /does not establish a current teaching assignment/);
});

test('record references cannot collide through punctuation or property insertion order', () => {
  const owner = entity('owner');
  const first = ref('a:b', 'c');
  const same = { source_record_id: 'c', source_record_key: 'a:b', source_key: first.source_key, collection: 'courses' };
  owner.relationships = [first, same, ref('a', 'b:c')].map(target_record => ({ type: 'profile_course', target_record, evidence: [evidence()] }));
  const edges = buildCampusGraphExport(snapshot([owner]), exportedAt).edges.filter(edge => edge.type === 'evidence_relationship');
  assert.equal(edges[0].to, edges[1].to);
  assert.notEqual(edges[0].to, edges[2].to);
});

test('missing and malformed targets stay explicit with no invented published identities', () => {
  const owner = entity('owner');
  owner.relationships = [
    { type: 'convener', target_entity_id: 'missing-person', evidence: [evidence()] },
    { type: 'convener', target_entity_id: 'missing-person', evidence: [evidence('second')] },
    { type: 'profile_course', target_record: { collection: 'courses' }, evidence: [evidence()] },
    { type: 'organized_by', evidence: [evidence()] },
    { type: 'convener', target_entity_id: owner.id, target_record: ref('unexpected'), evidence: [evidence()] },
  ];
  const result = buildCampusGraphExport(snapshot([owner]), exportedAt);
  assert.equal(result.counts.published_identities, 1);
  assert.equal(result.counts.missing_or_invalid_relationship_targets, 5);
  assert.equal(result.nodes.filter(node => node.status === 'missing').length, 1);
  const missing = result.nodes.find(node => node.status === 'missing');
  assert.equal(missing.entity_id, 'missing-person');
  assert.equal('name' in missing, false);
  assert.equal('aliases' in missing, false);
  assert.equal(result.nodes.filter(node => node.resolution === 'invalid').length, 3);
  assert.equal(result.diagnostics.length, 5);
  const nodes = new Set(result.nodes.map(node => node.id));
  assert.equal(nodes.size, result.nodes.length);
  assert.equal(new Set(result.edges.map(edge => edge.id)).size, result.edges.length);
  for (const edge of result.edges) {
    assert.ok(nodes.has(edge.from), `Missing from node ${edge.from}`);
    assert.ok(nodes.has(edge.to), `Missing to node ${edge.to}`);
  }
});

test('navigation is separate from factual edges and retains every published source route', () => {
  const result = buildCampusGraphExport(snapshot([]), exportedAt);
  assert.equal(result.nodes.filter(node => node.type === 'category').length, 12);
  assert.ok(result.edges.every(edge => edge.type === 'browse'));
  assert.equal(result.counts.evidence_relationships, 0);
  assert.equal(result.nodes.filter(node => node.type === 'record_reference' && node.selector.collection === 'artifacts').length, 17);
  const collections = result.nodes.filter(node => node.type === 'record_selection' && node.selection_kind === 'collection');
  assert.equal(collections.length, 16);
  assert.ok(collections.every(node => !Object.hasOwn(node.selector, 'entity_id')));
  assert.equal(result.completeness.source_record_bodies, 'not_embedded');
  assert.equal(result.completeness.unlinked_individual_source_records, 'not_embedded');
  assert.equal(result.completeness.raw_artifact_payloads, 'not_embedded');
  assert.equal(result.completeness.source_references_resolved_during_export, false);
});

test('fixed snapshot and clock give deterministic output with no mutation or shared data', () => {
  const owner = entity('owner');
  owner.links = [{ collection: 'contacts', source_key: 'directory', source_record_keys: ['key'] }];
  const index = snapshot([owner]);
  const before = structuredClone(index);
  const first = buildCampusGraphExport(index, exportedAt);
  assert.deepEqual(first, buildCampusGraphExport(index, exportedAt));
  assert.equal(first.exported_at, exportedAt);
  assert.deepEqual(first.snapshot, { dataset_version: index.dataset_version, identity_hash: index.identity_hash, campus_date: index.campus_date });
  first.nodes.find(node => node.status === 'published').aliases.push('Changed in export');
  first.nodes.find(node => node.selection_kind === 'identity_source_link').selector.source_record_keys.push('Changed in export');
  first.coverage.unresolved.push({ reason: 'Changed in export' });
  first.navigation.data_topics.pop();
  assert.deepEqual(index, before);
  assert.deepEqual(buildCampusGraphExport(index, exportedAt), buildCampusGraphExport(before, exportedAt));
  const absent = snapshot([]);
  absent.coverage = null;
  const noCoverage = buildCampusGraphExport(absent, exportedAt);
  assert.equal(noCoverage.coverage, null);
  assert.equal(noCoverage.counts.unresolved_issues, null);
  assert.equal(noCoverage.completeness.coverage_report, 'not_available');
});
