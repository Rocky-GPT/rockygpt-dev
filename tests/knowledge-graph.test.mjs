import assert from 'node:assert/strict';
import test from 'node:test';
import { CAMPUS, connections, relationshipLabel, traverse } from '../lib/knowledge-graph.ts';

const event = { id: 'event', name: 'Hackathon', kind: 'event', aliases: [] };
const club = { id: 'club', name: 'Computing Club', kind: 'club', aliases: [] };
const person = { id: 'person', name: 'Professor', kind: 'person', aliases: [] };
const graph = { nodes: [event, club, person], edges: [
  { source: event.id, target: club.id, type: 'organized_by', evidence: [{ field: 'organizer_group_id' }] },
  { source: club.id, target: person.id, type: 'advisor', evidence: [{ field: 'advisor' }] },
] };

test('one continuous entity traversal follows both directions and retains the category scope', () => {
  const category = { type: 'category', kind: 'event', label: 'Events', query: 'Hack', page: 2 };
  let path = traverse([CAMPUS, category], event);
  const organizer = connections(graph, event.id)[0];
  path = traverse(path, organizer.target, organizer.label);
  const advisor = connections(graph, club.id).find(item => item.edge.type === 'advisor');
  path = traverse(path, advisor.target, advisor.label);
  assert.deepEqual(path.map(item => item.label), ['Ramapo College', 'Events', 'Hackathon', 'Computing Club', 'Professor']);
  assert.equal(path[3].via, 'organized by');
  assert.deepEqual(path.slice(0, 2), [CAMPUS, category]);
  const incoming = connections(graph, person.id)[0];
  assert.equal(incoming.label, 'advisor of');
  assert.equal(incoming.target.id, club.id);
  assert.deepEqual(incoming.edge.evidence, graph.edges[1].evidence);
});

test('unknown relationship kinds remain navigable without entity-type UI switches', () => {
  const other = { ...graph, edges: [{ source: event.id, target: club.id, type: 'supported_by', evidence: [] }] };
  assert.equal(connections(other, event.id)[0].label, 'supported by');
  assert.equal(connections(other, club.id)[0].label, 'incoming: supported by');
});

test('revisits preserve the journey and missing targets never become guessed entities', () => {
  let path = traverse(traverse([CAMPUS], event), club, 'organized by');
  path = traverse(path, event, 'organizes');
  assert.equal(path.length, 4);
  assert.equal(path.at(-1).via, 'organizes');
  assert.equal(traverse(path, event), path);
  assert.equal(connections({ nodes: [event], edges: graph.edges }, event.id).length, 0);
  assert.equal(relationshipLabel('profile_course'), 'lists course (undated)');
});
