import assert from 'node:assert/strict';
import test from 'node:test';
import { KIND_LABELS } from '../lib/identities.ts';
import {
  CAMPUS_DATA_TOPICS, CAMPUS_GRAPH_SOURCES, IDENTITY_TOPIC_SOURCES,
} from '../lib/campus-topics.ts';

const topicSources = [
  ...Object.values(IDENTITY_TOPIC_SOURCES),
  ...CAMPUS_DATA_TOPICS.map(topic => topic.sources),
];
const allSources = [CAMPUS_GRAPH_SOURCES, ...topicSources];

// Coverage contract observed from the active published collection catalogue.
// Removing the catch-all branch must not orphan a collection or raw artifact.
test('topic navigation retains access to all 17 published collections', () => {
  const collections = new Set(allSources.flatMap(sources => sources.collections.map(source => source.id)));
  if (allSources.some(sources => sources.artifacts.length)) collections.add('artifacts');
  assert.deepEqual([...collections].sort(), [
    'documents', 'critical_facts', 'contacts', 'campus_hours', 'dining_hours', 'menu',
    'calendar', 'events', 'clubs', 'programs', 'program_requirements', 'courses',
    'faculty', 'shuttle', 'document_chunks', 'shuttle_routes', 'artifacts',
  ].sort());
});

test('raw source coverage includes context and fields absent from structured records', () => {
  const artifacts = new Set(allSources.flatMap(sources => sources.artifacts.map(source => source.id)));
  assert.deepEqual([...artifacts].sort(), [
    'calendar', 'campus-identities', 'campus-identity-coverage', 'catalog-conveners',
    'clubs', 'courses', 'dining-hours', 'dining-hours-context', 'event-organizers',
    'events', 'faculty', 'hours', 'menu', 'menu-context', 'menu-week', 'programs',
    'transportation',
  ].sort());
  assert.deepEqual(CAMPUS_GRAPH_SOURCES.collections, []);
  assert.deepEqual(CAMPUS_GRAPH_SOURCES.artifacts.map(source => source.id).sort(), [
    'campus-identities', 'campus-identity-coverage',
  ]);
  for (const sources of topicSources) {
    assert.ok(sources.artifacts.every(source => !source.id.startsWith('campus-identit')));
  }
});

test('all identity categories retain an unscoped source route including unlinked rows', () => {
  assert.deepEqual(Object.keys(IDENTITY_TOPIC_SOURCES).sort(), Object.keys(KIND_LABELS).sort());
  assert.ok(IDENTITY_TOPIC_SOURCES.club.collections.some(source => source.id === 'clubs'));
  assert.ok(IDENTITY_TOPIC_SOURCES.program.collections.some(source => source.id === 'programs'));
  assert.ok(IDENTITY_TOPIC_SOURCES.program.collections.some(source => source.id === 'program_requirements'));
  for (const sources of allSources) {
    for (const source of [...sources.collections, ...sources.artifacts]) {
      assert.deepEqual(Object.keys(source).sort(), ['id', 'label']);
      assert.ok(source.id && source.label);
    }
  }
});

test('campus additions are domain topics with no catch-all main branch', () => {
  assert.deepEqual(CAMPUS_DATA_TOPICS.map(topic => topic.label), [
    'Transportation', 'Calendar', 'Courses', 'Documents', 'Campus facts',
  ]);
  assert.equal(new Set(CAMPUS_DATA_TOPICS.map(topic => topic.id)).size, CAMPUS_DATA_TOPICS.length);
  for (const topic of CAMPUS_DATA_TOPICS) {
    assert.ok(topic.sources.collections.some(source => source.id === topic.collection));
    assert.notEqual(topic.collection, 'artifacts');
    assert.doesNotMatch(topic.label, /all source/i);
  }
});

test('source routes have unique selectors within each topic', () => {
  for (const sources of allSources) {
    const selectors = [
      ...sources.collections.map(source => `collection:${source.id}`),
      ...sources.artifacts.map(source => `artifacts:${source.id}`),
    ];
    assert.equal(new Set(selectors).size, selectors.length);
  }
});
