import assert from 'node:assert/strict';
import test from 'node:test';
import {
  cardLine,
  cardRows,
  filterCards,
  filterTasks,
  flagReasons,
  formatDay,
  nodeNames,
  placeReason,
  plural,
  readListing,
  readTaskDetail,
  statusCounts,
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

// The cards the Brain's graph build joins from those three tasks (retrieval/card_join.py): the
// two parking tasks are one card, Public Safety's page winning over the undated orientation page.
const cards = {
  built_on: '2026-11-11',
  rules: { join_mean: 0.85, join_least: 0.78, big_group: 12 },
  items: [
    {
      id: 'c1',
      status: 'ready',
      flags: [],
      notes: [],
      owners: [SAFETY],
      members: [
        { record_id: 'page-permits', key: 'e0', role: 'winner' },
        { record_id: 'page-faq', key: 'e0', role: 'left_out', why: 'old' },
      ],
    },
    {
      id: 'c2',
      status: 'needs_look',
      flags: ['owner_unclear', 'no_date'],
      notes: ['owner_has_no_page'],
      owners: [ORIENTATION, SAFETY],
      members: [{ record_id: 'page-permits', key: 'e2', role: 'winner' }],
    },
  ],
};
const joined = { ...reply, cards };

test('a release built without cards has none, and one built with them sends them', () => {
  const without = readListing(reply);
  assert.equal(without.joined, false);
  assert.equal(without.cards, null);
  assert.deepEqual(cardRows(without), []);
  const listing = readListing(joined);
  assert.equal(listing.joined, true);
  assert.equal(listing.cards.builtOn, '2026-11-11');
  assert.deepEqual(listing.cards.items[0], {
    id: 'c1',
    status: 'ready',
    flags: [],
    notes: [],
    owners: [SAFETY],
    members: [
      { recordId: 'page-permits', key: 'e0', role: 'winner', why: null, label: null },
      { recordId: 'page-faq', key: 'e0', role: 'left_out', why: 'old', label: null },
    ],
  });
  // A card this page cannot read is left out: no winner first, or a status it does not know.
  const odd = readListing({
    ...reply,
    cards: {
      items: [
        ...cards.items,
        { id: 'c3', status: 'ready', members: [{ record_id: 'page-faq', key: 'e0', role: 'mentions' }] },
        { id: 'c4', status: 'hidden', members: [{ record_id: 'page-faq', key: 'e0', role: 'winner' }] },
        'nope',
      ],
    },
  });
  assert.deepEqual(odd.cards.items.map((card) => card.id), ['c1', 'c2']);
  assert.equal(odd.cards.builtOn, null);
});

test('each card has its tasks beside it, the winner first', () => {
  const rows = cardRows(readListing(joined));
  assert.deepEqual(rows.map((row) => row.card.id), ['c1', 'c2']);
  const [parking, ticket] = rows;
  assert.equal(parking.winner.id, 'page-permits:e0');
  assert.deepEqual(parking.places.map((place) => [place.row.id, place.member.role]), [
    ['page-permits:e0', 'winner'],
    ['page-faq:e0', 'left_out'],
  ]);
  assert.deepEqual(parking.owners, ['Public Safety']);
  assert.equal(parking.pages, 2);
  assert.deepEqual(ticket.owners, ['Orientation', 'Public Safety']);
  assert.equal(ticket.pages, 1);
  assert.deepEqual(statusCounts(rows), { ready: 1, needs_look: 1, date_passed: 0 });
  // A card whose winning task the list does not hold is left out; another task it does not hold
  // is dropped from the card.
  const missing = readListing({
    ...reply,
    cards: {
      items: [
        { id: 'gone', status: 'ready', members: [{ record_id: 'page-gone', key: 'e0', role: 'winner' }] },
        {
          id: 'part',
          status: 'ready',
          members: [
            { record_id: 'page-permits', key: 'e0', role: 'winner' },
            { record_id: 'page-gone', key: 'e0', role: 'mentions' },
          ],
        },
      ],
    },
  });
  assert.deepEqual(cardRows(missing).map((row) => [row.card.id, row.places.length]), [['part', 1]]);
});

test('cards are found by any of their tasks, and kept by status, office and joining', () => {
  const rows = cardRows(readListing(joined));
  const all = { query: '', node: null, status: null, joinedOnly: false };
  const found = (filter) => filterCards(rows, { ...all, ...filter }).map((row) => row.card.id);
  assert.deepEqual(found({}), ['c1', 'c2']);
  // "car" is only in the left-out orientation task's name: the card is still found by it.
  assert.deepEqual(found({ query: 'bring a car' }), ['c1']);
  assert.deepEqual(found({ query: 'ticket' }), ['c2']);
  assert.deepEqual(found({ query: 'transcript' }), []);
  assert.deepEqual(found({ status: 'needs_look' }), ['c2']);
  assert.deepEqual(found({ status: 'date_passed' }), []);
  assert.deepEqual(found({ joinedOnly: true }), ['c1']);
  // Orientation owns the second card and links the first card's left-out page.
  assert.deepEqual(found({ node: ORIENTATION }), ['c1', 'c2']);
  assert.deepEqual(found({ node: ORIENTATION, joinedOnly: true, query: 'permit' }), ['c1']);
  // A card named by the search comes before one that only mentions the word.
  assert.deepEqual(found({ query: 'appeal permits' }), ['c2']);
  assert.deepEqual(found({ query: 'permits' }), ['c1', 'c2']);
  assert.deepEqual(found({ query: 'ticket permits' }), ['c2']);
});

test('a card says in one line why it has its status', () => {
  const [parking, ticket] = cardRows(readListing(joined));
  assert.deepEqual(cardLine(parking), { text: '1 old page left out.', warns: false });
  assert.deepEqual(flagReasons(ticket), [
    'Its pages do not settle who handles it: Orientation, Public Safety.',
    'Its page carries no date, so its age cannot be told.',
  ]);
  assert.equal(cardLine(ticket).warns, true);
  assert.equal(placeReason(parking.places[0]), 'Changed Aug 17, 2026');
  assert.equal(placeReason(parking.places[1]), 'Old page, no date on the page');
  // A card whose own date passed names it; so does a past-term page left out of a current card.
  const passed = cardRows(
    readListing({
      ...reply,
      cards: {
        items: [
          {
            id: 'c5',
            status: 'date_passed',
            flags: [],
            notes: [],
            owners: [SAFETY],
            members: [
              { record_id: 'page-permits', key: 'e0', role: 'winner', label: 'September 1, 2026' },
              { record_id: 'page-faq', key: 'e0', role: 'left_out', why: 'over', label: 'Fall 2022' },
            ],
          },
        ],
      },
    })
  )[0];
  assert.deepEqual(cardLine(passed), { text: 'Its date passed: September 1, 2026.', warns: false });
  assert.equal(placeReason(passed.places[0]), 'Its date passed: September 1, 2026');
  assert.equal(placeReason(passed.places[1]), 'Past term or date: Fall 2022');
  // A ready card of one task says its page's date, or that the page is old.
  const single = (notes, updated) =>
    cardRows(
      readListing({
        ...reply,
        pages: [reply.pages[0], { ...reply.pages[1], updated }],
        cards: {
          items: [
            { id: 'c6', status: 'ready', flags: [], notes, owners: [SAFETY], members: [cards.items[0].members[0]] },
          ],
        },
      })
    )[0];
  assert.equal(cardLine(single([], '2026-08-17')).text, 'Page changed Aug 17, 2026.');
  assert.equal(
    cardLine(single(['old_page'], '2017-07-03')).text,
    'Its page last changed Jul 3, 2017, three or more years ago.'
  );
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
