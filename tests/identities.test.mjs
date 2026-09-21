import assert from 'node:assert/strict';
import test from 'node:test';
import { componentState, displayValue, publishedMealLabels, recordsForSection, safeSourceUrl } from '../lib/identities.ts';

const component = {
  status: 'available', evidence_ids: ['contacts:a'], conflicts: {}, fields: {},
  failed_links: 0, linked_records_missing: 0, relationships_missing: 0,
  total_matches: 1, returned_count: 1, omitted_count: 0, truncated: false,
};

test('conflicting evidence and broken links cannot appear as healthy available sections', () => {
  const conflict = { ...component, conflicts: { phone: [{ value: '123', evidence_ids: ['contacts:a'] }] } };
  assert.equal(componentState(conflict).label, 'Conflicting values');
  assert.equal(componentState({ ...component, linked_records_missing: 1 }).tone, 'warn');
  assert.equal(componentState({ ...component, relationships_missing: 1 }).tone, 'warn');
});

test('missing hours and partial menu coverage remain distinct from closure and completeness', () => {
  assert.equal(componentState({ ...component, status: 'missing' }).label, 'No linked evidence');
  assert.equal(componentState({ ...component, status: 'partial', omitted_count: 39 }).label, 'Partial');
});

test('selecting a section shows only its own evidence even when the profile includes other records', () => {
  const contact = { id: 'contacts:a', fields: { email: 'test@example.edu' } };
  const menu = { id: 'menu:b' };
  assert.deepEqual(recordsForSection({ records: [contact, menu], components: { contact: { ...component, fields: { email: 'published' } } } }, 'contact'), [contact]);
  assert.deepEqual(recordsForSection({ records: [contact, menu], components: {} }, 'hours'), []);
});

test('merged faculty evidence remains selective in contact and undated course views', () => {
  const faculty = { id: 'faculty:a', collection: 'faculty', fields: { email: 'test@example.edu', bio: 'Biography', courses: ['Undated seminar'] } };
  const section = { ...component, evidence_ids: ['faculty:a'], fields: { email: 'published' } };
  const profile = { records: [faculty], components: { contact: section, courses: section } };
  assert.deepEqual(recordsForSection(profile, 'contact')[0].fields, { email: 'test@example.edu' });
  assert.deepEqual(recordsForSection(profile, 'courses')[0].fields, { courses: ['Undated seminar'] });
  assert.equal(faculty.fields.bio, 'Biography');
});

test('source links accept published web URLs and reject executable or local schemes', () => {
  assert.equal(safeSourceUrl('https://example.edu/faculty?a=1'), 'https://example.edu/faculty?a=1');
  for (const value of ['javascript:alert(1)', 'data:text/html,<script>', 'file:///private/file', '//example.edu', 'not a URL']) {
    assert.equal(safeSourceUrl(value), undefined);
  }
});

test('unknown field display does not erase explicit false or zero source values', () => {
  assert.equal(displayValue(null), 'Not published');
  assert.equal(displayValue(false), 'false');
  assert.equal(displayValue(0), '0');
});

test('meal controls preserve unusual published meal labels instead of inventing a fixed schedule', () => {
  assert.deepEqual(publishedMealLabels({ records: [
    { collection: 'dining_hours', fields: { periods: [{ label: 'Continental' }, { label: 'Lite Lunch' }, null] } },
    { collection: 'menu', fields: { meal: 'Lunch' } },
  ] }), ['Continental', 'Lite Lunch', 'Lunch']);
  assert.deepEqual(publishedMealLabels(), []);
});
