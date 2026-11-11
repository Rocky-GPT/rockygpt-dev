import assert from 'node:assert/strict';
import test from 'node:test';
import {
  filterTasks,
  formatDay,
  nodeNames,
  plural,
  readListing,
  readTaskDetail,
  taskRows,
} from '../lib/answer-cards.ts';

const SAFETY = '4c0063a5-62be-44cd-8a11-35151b945be4';
const ORIENTATION = 'e2f70325-f937-446d-9ddd-f54a2eb2b746';

// The shape the Brain's GET /v1/dev/answer-cards sends (snake case, empty fields left out).
const reply = {
  dataset_version: 'v2-20261111133419',
  identity_hash: '758d63c9',
  cards: null,
  totals: { pages_read: 3, pages_with_tasks: 2, tasks: 3, steps: 6 },
  nodes: [
    { entity_id: ORIENTATION, name: 'Orientation', kind: 'office', pages: 1, tasks: 1 },
    { entity_id: SAFETY, name: 'Public Safety', kind: 'office', pages: 2, tasks: 3 },
  ],
  pages: [
    {
      record_id: 'page-faq',
      url: 'https://www.ramapo.edu/orientation/faq/',
      path: '/orientation/faq',
      updated: null,
      collected_at: '2026-11-10T12:39:26+00:00',
      nodes: [ORIENTATION, SAFETY],
      tasks: [{ key: 'e0', task: 'Bring a car to campus', applies_to: 'new students', section: 'Cars', steps: 2 }],
    },
    {
      record_id: 'page-permits',
      url: 'https://www.ramapo.edu/publicsafety/parking-permits/',
      path: '/publicsafety/parking-permits',
      updated: '2026-08-17',
      collected_at: '2026-11-10T12:39:26+00:00',
      nodes: [SAFETY],
      tasks: [
        { key: 'e0', task: 'Get a student parking permit', term: 'Fall 2026', section: 'Permits', steps: 3 },
        { key: 'e2', task: 'Appeal a ticket', handled_by: 'Student Accounts', section: 'Tickets', steps: 1 },
      ],
    },
  ],
};

test('reads the Brain list: totals, nodes, and each page with its tasks', () => {
  const listing = readListing(reply);
  assert.equal(listing.datasetVersion, 'v2-20261111133419');
  assert.equal(listing.joined, false);
  assert.deepEqual(listing.totals, { pagesRead: 3, pagesWithTasks: 2, tasks: 3, steps: 6 });
  assert.deepEqual(listing.nodes[1], { entityId: SAFETY, name: 'Public Safety', kind: 'office', pages: 2, tasks: 3 });
  assert.deepEqual(listing.pages[1], {
    recordId: 'page-permits',
    url: 'https://www.ramapo.edu/publicsafety/parking-permits/',
    path: '/publicsafety/parking-permits',
    updated: '2026-08-17',
    nodes: [SAFETY],
    tasks: [
      { key: 'e0', task: 'Get a student parking permit', appliesTo: null, handledBy: null, term: 'Fall 2026', section: 'Permits', steps: 3 },
      { key: 'e2', task: 'Appeal a ticket', appliesTo: null, handledBy: 'Student Accounts', term: null, section: 'Tickets', steps: 1 },
    ],
  });
});

test('says cards are joined only when the Brain sends them', () => {
  assert.equal(readListing({ ...reply, cards: [] }).joined, true);
});

test('a reply that is not a task list reads as nothing, and a row it cannot read is left out', () => {
  assert.equal(readListing(null), null);
  assert.equal(readListing({ error: { message: 'Campus data is unavailable.' } }), null);
  assert.equal(readListing({ ...reply, dataset_version: '' }), null);
  const listing = readListing({
    ...reply,
    pages: [...reply.pages, { record_id: 'no-tasks', tasks: [] }, { url: 'no id', tasks: [{ key: 'e0', task: 'x' }] }, 7],
    nodes: [...reply.nodes, { name: 'no id' }],
  });
  assert.equal(listing.pages.length, 2);
  assert.equal(listing.nodes.length, 2);
});

test('one row per task, found by the task, who it is for, the office, the term and the address', () => {
  const listing = readListing(reply);
  const rows = taskRows(listing);
  assert.deepEqual(rows.map((row) => row.id), ['page-faq:e0', 'page-permits:e0', 'page-permits:e2']);
  const found = (query, node = null) => filterTasks(rows, query, node).map((row) => row.id);
  assert.deepEqual(found(''), ['page-faq:e0', 'page-permits:e0', 'page-permits:e2']);
  // Both tasks on the permits page have both words (one in its address and the office the page
  // names); the task with them in its own name comes first.
  assert.deepEqual(found('PERMIT student'), ['page-permits:e0', 'page-permits:e2']);
  assert.deepEqual(found('permit get'), ['page-permits:e0']);
  assert.deepEqual(found('new students'), ['page-faq:e0']);
  assert.deepEqual(found('student accounts'), ['page-permits:e2']);
  assert.deepEqual(found('fall 2026'), ['page-permits:e0']);
  assert.deepEqual(found('orientation'), ['page-faq:e0']);
  assert.deepEqual(found('transcript'), []);
  // The office filter keeps the tasks on pages that office links.
  assert.deepEqual(found('', ORIENTATION), ['page-faq:e0']);
  assert.deepEqual(found('ticket', ORIENTATION), []);
});

test('a task named by the search comes before one that only mentions it', () => {
  const rows = taskRows(readListing(reply));
  // "parking" is in the first row's office and address only, and in the second row's own name.
  const named = { ...rows[0], id: 'named', name: 'pay a parking ticket', words: 'pay a parking ticket' };
  const mentioned = { ...rows[0], id: 'mentioned', name: 'bring a car', words: 'bring a car /parking' };
  assert.deepEqual(filterTasks([mentioned, named], 'parking', null).map((row) => row.id), ['named', 'mentioned']);
});

test('reads one task: each step with the page words behind it', () => {
  const detail = readTaskDetail({
    dataset_version: 'v2-20261111133419',
    identity_hash: '758d63c9',
    task: {
      key: 'e0',
      task: 'Get a student parking permit',
      term: 'Fall 2026',
      section: 'Permits',
      steps: [
        { text: 'Register online.', quote: 'Click Here for Parking Permit Registration' },
        { text: 'Pick up the permit.', quote: null },
        { text: '', quote: 'no words, so not a step' },
      ],
    },
    page: {
      record_id: 'page-permits',
      url: 'https://www.ramapo.edu/publicsafety/parking-permits/',
      path: '/publicsafety/parking-permits',
      updated: '2026-08-17',
      collected_at: '2026-11-10T12:39:26.880000+00:00',
      other_tasks: [{ key: 'e2', task: 'Appeal a ticket' }],
    },
    nodes: [{ entity_id: SAFETY, name: 'Public Safety', kind: 'office' }],
  });
  assert.deepEqual(detail.task.steps, [
    { text: 'Register online.', quote: 'Click Here for Parking Permit Registration' },
    { text: 'Pick up the permit.', quote: null },
  ]);
  assert.equal(detail.page.collectedAt, '2026-11-10T12:39:26.880000+00:00');
  assert.deepEqual(detail.page.otherTasks, [{ key: 'e2', task: 'Appeal a ticket' }]);
  assert.deepEqual(detail.nodes, [{ entityId: SAFETY, name: 'Public Safety', kind: 'office' }]);
  assert.equal(readTaskDetail({ task: {}, page: {} }), null);
  assert.equal(readTaskDetail('nope'), null);
});

test('names, days and counts read the way the page says them', () => {
  assert.equal(nodeNames(readListing(reply)).get(SAFETY), 'Public Safety');
  assert.equal(formatDay('2026-08-17'), 'Aug 17, 2026');
  assert.equal(formatDay('2026-11-10T12:39:26.880000+00:00'), 'Nov 10, 2026');
  assert.equal(formatDay('soon'), 'soon');
  assert.equal(plural(1, 'step'), '1 step');
  assert.equal(plural(8102, 'task'), '8,102 tasks');
});
