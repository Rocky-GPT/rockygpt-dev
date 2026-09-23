import assert from 'node:assert/strict';
import test from 'node:test';
import { CAMPUS, relationshipLabel, traverse } from '../lib/knowledge-graph.ts';

const event = { id: 'event', name: 'Hackathon', kind: 'event', aliases: [] };
const club = { id: 'club', name: 'Computing Club', kind: 'club', aliases: [] };
const person = { id: 'person', name: 'Professor', kind: 'person', aliases: [] };
test('one continuous entity traversal follows both directions and retains the category scope', () => {
  const category = { type: 'category', kind: 'event', label: 'Events', query: 'Hack' };
  let path = traverse([CAMPUS, category], event);
  path = traverse(path, club, relationshipLabel('organized_by'));
  path = traverse(path, person, relationshipLabel('advisor'));
  assert.deepEqual(path.map(item => item.label), ['Ramapo College', 'Events', 'Hackathon', 'Computing Club', 'Professor']);
  assert.equal(path[3].via, 'organized by');
  assert.deepEqual(path.slice(0, 2), [CAMPUS, category]);
  assert.equal(relationshipLabel('advisor', true), 'advisor of');
});

test('unknown relationship kinds keep a readable label in both directions', () => {
  assert.equal(relationshipLabel('supported_by'), 'supported by');
  assert.equal(relationshipLabel('supported_by', true), 'incoming: supported by');
});

test('revisits preserve the journey and relationships keep their published labels', () => {
  let path = traverse(traverse([CAMPUS], event), club, 'organized by');
  path = traverse(path, event, 'organizes');
  assert.equal(path.length, 4);
  assert.equal(path.at(-1).via, 'organizes');
  assert.equal(traverse(path, event), path);
  assert.equal(relationshipLabel('profile_course'), 'lists course (undated)');
  assert.equal(relationshipLabel('listed_faculty', true), 'listed faculty of');
  assert.equal(relationshipLabel('office_at'), 'office in');
  assert.equal(relationshipLabel('located_at', true), 'location of');
  assert.equal(relationshipLabel('includes_course'), 'includes course');
  assert.equal(relationshipLabel('includes_course', true), 'in subject');
});
