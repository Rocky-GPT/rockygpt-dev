import assert from 'node:assert/strict';
import test from 'node:test';
import {
  campusToday, dateInName, datedEvents, hoursSpans, linkGroups, menuMeals, openNow, prerequisiteSteps,
  profileCourses, requirementGroups, titleCase, weekHours,
} from '../lib/graph-cards.ts';

test('a schedule line reads as spans, with or without meal names, and unreadable lines give none', () => {
  assert.deepEqual(hoursSpans('Breakfast: 08:00 AM - 10:30 AM; Lunch: 11:00 AM - 02:00 PM').map(span => [span.label, span.from, span.to]),
    [['Breakfast', 480, 630], ['Lunch', 660, 840]]);
  // "10:00am" is a time, not a label called "10".
  assert.deepEqual(hoursSpans('10:00am-8:00pm').map(span => [span.label, span.from, span.to]), [[null, 600, 1200]]);
  assert.deepEqual(hoursSpans('Hours unavailable'), []);
  assert.deepEqual(hoursSpans('Late Night: 09:00 PM - 01:00 AM')[0].to, 25 * 60);
});

test('open now says until when, and the next opening when closed', () => {
  const line = 'Lunch: 11:00 AM - 02:00 PM; Dinner: 05:00 PM - 08:00 PM';
  assert.deepEqual(openNow(line, 12 * 60), { open: true, label: 'Lunch', until: '02:00 PM', next: hoursSpans(line)[1] });
  const closed = openNow(line, 15 * 60);
  assert.equal(closed.open, false);
  assert.equal(closed.next.label, 'Dinner');
  assert.equal(openNow('Hours unavailable', 600), null);
});

test('a week of hours keeps a one-off day only while it is current', () => {
  const rows = [
    { day: 'Friday', schedule: '8 AM - 5 PM' },
    { day: 'Friday', schedule: 'Closed', valid_from: '2026-10-01', valid_until: '2026-10-02' },
    { day: 'Monday', schedule: '9 AM - 5 PM' },
    { day: 'Monday', schedule: 'Closed for the holiday', valid_from: '2026-11-02', valid_until: '2026-11-02' },
  ];
  assert.deepEqual(weekHours(rows, '2026-11-02').map(day => [day.day, day.schedule, day.dated]),
    [['Monday', 'Closed for the holiday', true], ['Friday', '8 AM - 5 PM', false]]);
});

test('the campus clock is New York time', () => {
  assert.deepEqual(campusToday(new Date('2026-11-03T03:30:00Z')), { date: '2026-11-02', weekday: 'Monday', minutes: 22 * 60 + 30 });
});

test('dates in node names and event order: upcoming first, then past, newest first', () => {
  assert.equal(dateInName('Girls Night In (2026-11-05)'), '2026-11-05');
  assert.equal(dateInName('Reading Day (No Classes) (Dec 8, 2026)'), '2026-12-08');
  assert.equal(dateInName('No date here'), null);
  const node = (label, brief) => ({ id: label, label, kind: 'event', brief });
  const order = datedEvents([node('A (2026-10-01)'), node('B (2026-11-20)'), node('C', { date: 'Thu, Nov 5, 2026' }), node('D (2026-10-20)')], '2026-11-02');
  assert.deepEqual(order.map(item => [item.node.label, item.date, item.past]),
    [['C', '2026-11-05', false], ['B (2026-11-20)', '2026-11-20', false], ['D (2026-10-20)', '2026-10-20', true], ['A (2026-10-01)', '2026-10-01', true]]);
});

test('links group by type, direction and kind with plain words', () => {
  const read = {
    node: { id: 'entity:p', label: 'Pat', kind: 'person' },
    outgoing: [
      { type: 'profile_course', node: { id: 'entity:c1', label: 'MATH 101', kind: 'course' }, sources: [] },
      { type: 'profile_course', node: null, record: { collection: 'courses', source_key: 'c', source_record_key: 'MATH 999' }, sources: [] },
    ],
    incoming: [{ type: 'convener', node: { id: 'entity:g', label: 'Math BS', kind: 'program' }, sources: [] }],
  };
  assert.deepEqual(linkGroups(read).map(group => [group.label, group.nodes.length, group.missing]),
    [['teaches', 1, 0], ['teaches', 0, 1], ['leads', 1, 0]]);
  // A cross-listing reads the same from either course.
  const course = (id, label) => ({ id, label, kind: 'course' });
  const listed = { node: course('entity:a', 'AMER 311'), outgoing: [{ type: 'cross_listed', node: course('entity:b', 'ARHT 311'), sources: [] }], incoming: [] };
  const other = { node: course('entity:b', 'ARHT 311'), outgoing: [], incoming: [{ type: 'cross_listed', node: course('entity:a', 'AMER 311'), sources: [] }] };
  assert.deepEqual([...linkGroups(listed), ...linkGroups(other)].map(group => group.label), ['cross-listed with', 'cross-listed with']);
  // A category names what it holds by kind: Archway's clubs and offices, the catalog's courses.
  const tag = { id: 'entity:writ', label: 'WRITING INTENSIVE (WRIT)', kind: 'course_attribute' };
  const category = { id: 'entity:honor', label: 'Honor Society', kind: 'club_category' };
  const filed = { node: course('entity:c', 'LITR 201'), outgoing: [{ type: 'in_category', node: tag, sources: [] }], incoming: [] };
  const tagged = { node: tag, outgoing: [], incoming: [{ type: 'in_category', node: course('entity:c', 'LITR 201'), sources: [] }] };
  const honor = { node: category, outgoing: [], incoming: [
    { type: 'in_category', node: { id: 'entity:d', label: 'Phi Alpha', kind: 'club' }, sources: [] },
    { type: 'in_category', node: { id: 'entity:e', label: 'Yearbook', kind: 'office' }, sources: [] }] };
  const club = { node: { id: 'entity:d', label: 'Phi Alpha', kind: 'club' }, outgoing: [{ type: 'in_category', node: category, sources: [] }], incoming: [] };
  assert.deepEqual([filed, tagged, honor, club].flatMap(read => linkGroups(read).map(group => group.label)),
    ['attributes', 'courses', 'clubs', 'offices', 'category']);
});

test('a menu day groups into meals in serving order, stations, and dishes once each', () => {
  const dish = (meal, station, name, extra = {}) => ({ meal, station, name, ...extra });
  const meals = menuMeals([dish('Dinner', 'Grill', 'Burger', { calories: 450 }), dish('Breakfast', 'Savory', 'Oatmeal', { vegan: true }),
    dish('Dinner', 'Grill', 'Burger'), dish('Dinner', 'Soup', 'Tomato', { allergens: ['Milk'] })]);
  assert.deepEqual(meals.map(meal => [meal.name, meal.count, meal.stations.map(station => station.name)]),
    [['Breakfast', 1, ['Savory']], ['Dinner', 2, ['Grill', 'Soup']]]);
  assert.equal(meals[0].stations[0].dishes[0].vegan, true);
});

test('catalog rules: prerequisites as steps, requirement groups with their choice', () => {
  const course = { requisites: [{ rule: { items: [
    { codes: [{ code: 'CMPS 320', name: 'MACHINE LEARNING' }], logic: 'and' },
    { codes: [{ code: 'CRWT 102', name: 'X' }, { code: 'CRWT 102S', name: 'X' }], logic: 'or' },
  ] } }] };
  assert.deepEqual(prerequisiteSteps(course).map(step => step.map(choice => choice.code)), [['CMPS 320'], ['CRWT 102', 'CRWT 102S']]);
  const groups = requirementGroups([
    { requirement: { label: 'Math', rule: { name: 'Select 3 Courses', choose: { at_least: 3 }, items: [{ courses: [{ code: 'MATH 205', name: 'A', course_id: 'id1' }] }] } } },
    { requirement: { label: 'Core', rule: { name: 'Required Courses', choose: { all: true }, items: [{ courses: [{ code: 'DATA 101' }] }] } } },
    { requirement: { label: 'Empty', rule: { items: [] } } },
  ]);
  assert.deepEqual(groups.map(group => [group.label, group.choose, group.courses.map(c => c.id)]), [['Math', 'pick 3', ['id1']], ['Core', 'all of', [null]]]);
});

test('profile course lines and catalog capitals read plainly', () => {
  assert.deepEqual(profileCourses(['Undergraduate:\nCMPS 130 Scientific Problem Solving with Python', 'MATH 562 Applied Linear Algebra']),
    [{ level: 'Undergraduate', code: 'CMPS 130', title: 'Scientific Problem Solving with Python' }, { level: 'Courses', code: 'MATH 562', title: 'Applied Linear Algebra' }]);
  assert.equal(titleCase('DATA SCIENCE CAPSTONE PROJECT'), 'Data Science Capstone Project');
  assert.equal(titleCase('CALCULUS II'), 'Calculus II');
  assert.equal(titleCase('ETHICS OF TECHNOLOGY'), 'Ethics of Technology');
  assert.equal(titleCase('Already Mixed case'), 'Already Mixed case');
});
