import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalPhonePreview, collectionDescription, fieldLabel, initials, namedLinks, nodeSummary, overviewFields, overviewSources, photoUrl, shortUrl, sourceLabel } from '../lib/graph-presentation.ts';
import { buildContentSecurityPolicy, PHOTO_ORIGINS } from '../lib/security-headers.ts';

const field = (label, value, options = {}) => {
  const source = { id: options.sourceId ?? 'contacts:one', collection: 'contacts', row_id: 'one', source_key: 'directory', source_record_key: 'birch',
    source_url: 'https://example.edu', collected_at: null, valid_from: null, valid_until: null, freshness: 'fresh', limitations: [], ...options.source };
  const assertion = { id: `assertion:${label}`, value, source_id: source.id, field_path: [label], publication_status: 'unspecified', limitations: [], ...options.assertion };
  const values = [{ value, assertion, source }];
  return { id: `field:${label}`, label, propertyKey: label, kind: 'property', children: [], category: options.category ?? 'details', status: options.status ?? 'known', values,
    factValues: [{ id: `value:${label}`, value: Object.hasOwn(options, 'canonical') ? options.canonical : value, assertions: values,
      assertion_ids: [assertion.id], supporting_evidence_ids: [source.id], evidence_count: 1, valid_from: null, valid_until: null }] };
};
const entity = children => ({ id: 'birch', label: 'Birch Tree Inn', kind: 'entity', subtitle: 'venue', children });

test('only facts the backend marks unknown fold away; known empty lists, false, zero and disputed values stay', () => {
  const unknown = [null, '', [], {}].map((value, i) => field(`empty${i}`, value, { status: 'unknown' }));
  const known = [false, 0, [], {}, [null], { unknown: null }].map((value, i) => field(`known${i}`, value));
  const disputed = [field('conflict', null, { status: 'conflicting' }), field('periods', null, { status: 'multiple' })];
  const root = entity([...unknown, ...known, ...disputed]), before = structuredClone(root);
  const fields = overviewFields(root);
  assert.deepEqual(fields.hidden.map(({ field, reason }) => [field, reason]), unknown.map(field => [field, 'Not published']));
  assert.deepEqual(fields.main, [...known, ...disputed]);
  assert.strictEqual(fields.main[0], known[0]);
  assert.deepEqual(root, before);
});


test('labels and canonical values come from the backend, with raw parser values retained only as evidence', () => {
  const name = field('name', 'Birch Tree Inn');
  const type = field('Source record type', 'office');
  const preference = field('Email preference', false, { status: 'unknown', category: 'contact', canonical: null });
  const root = entity([name, type, preference]);
  assert.equal(root.subtitle, 'venue');
  assert.equal(fieldLabel(type), 'Source record type');
  assert.equal(fieldLabel(preference), 'Email preference');
  const key = label => fieldLabel({ id: label, label, kind: 'value', children: [] });
  assert.deepEqual(['transFat', 'vitaminA', 'calories_from_fat', 'number', 'Value 2'].map(key), ['Trans fat', 'Vitamin A', 'Calories from fat', 'Number', 'Value 2']);
  assert.equal(nodeSummary(preference), 'No value provided');
  assert.equal(preference.values[0].assertion.value, false);
  assert.deepEqual(overviewFields(root).hidden.map(({ field, reason }) => [field, reason]), [[name, 'Shown as the heading'], [preference, 'Not published']]);
  assert.equal(nodeSummary(field('Other boolean', false)), 'false');
});


test('record descriptions preserve exact loading totals and contextual subtitles', () => {
  const record = { id: 'one', label: 'Repeated dish', kind: 'record', subtitle: 'meal: Breakfast · date: 2026-09-23', children: [] };
  const group = { id: 'menu', label: 'Menu offerings', kind: 'group', subtitle: '100 of 874 records', pending: true, children: [record] };
  assert.equal(collectionDescription(group), 'Entries across dates, meals and stations; dishes may repeat.');
  assert.match(collectionDescription({ ...group, label: 'Dining hours' }), /validity periods/);
  assert.match(collectionDescription({ ...group, label: 'Operating hours' }), /validity periods/);
  // Other collections need no explanation beyond their name and size.
  assert.equal(collectionDescription({ ...group, label: 'Other' }), '');
  assert.equal(nodeSummary(group), '100 of 874 records · Loading more records…');
  assert.equal(nodeSummary({ ...group, subtitle: '1 of 2 records', pending: false }), '1 of 2 records');
  assert.equal(nodeSummary(record), record.subtitle);
  assert.equal(nodeSummary(field('calories', 0)), '0');
});

test('presentation leaves relationship targets, evidence and repeated record identities untouched', () => {
  const edge = { id: 'edge', label: 'Dining Services', kind: 'relationship', children: [], target: { id: 'office' }, relationship: { id: 'published-edge', evidence: [{ field: 'office_id' }] } };
  const group = { id: 'group', label: 'Menu offerings', kind: 'group', children: [{ id: 'breakfast', label: 'Same dish' }, { id: 'lunch', label: 'Same dish' }] };
  const root = entity([field('Phone', '201-555-0100'), edge, group]), before = structuredClone(root);
  assert.equal(overviewFields(root).main.length, 1);
  assert.deepEqual(root, before);
  assert.strictEqual(root.children[1], edge);
  assert.deepEqual(group.children.map(node => node.id), ['breakfast', 'lunch']);
});

test('canonical phone previews preserve ordered entries, extensions, labels and unparsed text without inventing digits', () => {
  const values = [{ number: '201-684-7392', extension: null, type: null }, { extension: '0076', type: 'office' },
    { number: 'published non-dialable text', extension: '03', type: 'direct' }, { number: '914-555-0100', type: 'cell' }];
  const node = field('phones', values, { category: 'contact' });
  const before = structuredClone(node);
  assert.equal(canonicalPhonePreview(node, values), '201-684-7392\next. 0076 (office)\npublished non-dialable text ext. 03 (direct)\n914-555-0100 (cell)');
  assert.deepEqual(node, before);
  assert.equal(canonicalPhonePreview(node, [{ number: '201-684-7392' }]), '201-684-7392');
  for (const value of [null, [], '201-684-7392', [{ type: 'office' }], [{ number: '201-684-7392', unknown: 'preserve in structured view' }]]) {
    assert.equal(canonicalPhonePreview(node, value), undefined);
  }
  assert.equal(canonicalPhonePreview({ ...node, propertyKey: 'other' }, values), undefined);
});

test('verified lineage stays with its source while otherwise empty fields fold', () => {
  const note = 'Derived from the linked faculty profile; these records are not independent corroboration.';
  const lineage = { derived_from_source_id: 'faculty:one', limitations: [note] };
  const empty = field('status', null, { status: 'unknown', source: lineage });
  const name = field('name', 'Birch Tree Inn', { source: lineage });
  const root = entity([empty, name]), before = structuredClone(root);
  const fields = overviewFields(root);
  assert.deepEqual(fields.hidden.map(({ field, reason }) => [field, reason]), [[empty, 'Not published'], [name, 'Shown as the heading']]);
  assert.strictEqual(fields.hidden[0].field.values[0].source, empty.values[0].source);
  assert.deepEqual(overviewSources(root).map(({ source, derivedFrom }) => [source.limitations, derivedFrom]), [[[note], 'faculty:one']]);
  assert.deepEqual(root, before);
});

test('an overview puts role facts under the heading, contact facts in one strip and folds what asserts nothing', () => {
  const person = children => ({ id: 'ali', label: 'Ali Al-Juboori', kind: 'entity', subtitle: 'person', children });
  const title = field('title', 'Associate Professor of Computer Science');
  const school = field('school', 'School of Science, Nursing, and Health', { category: 'academic' });
  const department = field('department', 'School of Science, Nursing, and Health', { category: 'academic' });
  const email = field('email', 'aaljuboo@ramapo.edu', { category: 'contact' });
  const profile = field('profile_url', 'https://www.ramapo.edu/snh/faculty/ali-al-juboori/', { category: 'links' });
  const name = field('name', 'Ali Al-Juboori');
  const type = field('type', 'person');
  const bio = field('bio', 'Office hours by appointment');
  const courses = field('profile_courses', ['Computer Science I'], { category: 'academic' });
  const preference = field('prefers_email', null, { status: 'unknown', category: 'contact', assertion: { limitations: ['Absence does not mean email is refused.'] } });
  const teaching = field('teaching_interests', [], { status: 'unknown', category: 'academic' });
  const conflict = field('phone', null, { status: 'conflicting', category: 'contact' });
  const root = person([title, school, department, email, profile, name, type, bio, courses, preference, teaching, conflict]);
  const before = structuredClone(root);
  const fields = overviewFields(root);
  assert.deepEqual(fields.headline, [title, school]);
  assert.deepEqual(fields.contact, [email, profile, conflict]);
  // General details read first, then academic ones.
  assert.deepEqual(fields.main, [bio, courses]);
  assert.deepEqual(fields.hidden.map(({ field, reason }) => [field.propertyKey, reason]), [
    ['department', 'Same as school'], ['name', 'Shown as the heading'], ['type', 'Record metadata'],
    ['prefers_email', 'Not published'], ['teaching_interests', 'Not published'],
  ]);
  // A folded field keeps its caveats; a disputed one is never folded.
  assert.deepEqual(fields.hidden[3].field.values[0].assertion.limitations, ['Absence does not mean email is refused.']);
  assert.strictEqual(fields.contact[2], conflict);
  assert.deepEqual(root, before);
  // Without a school, the department describes the entity; records have no headline.
  assert.deepEqual(overviewFields(person([department, email])).headline, [department]);
  assert.deepEqual(overviewFields({ ...person([title, email]), kind: 'record' }).headline, []);
});

test('an overview lists each source once and names what a derived source came from', () => {
  const faculty = { id: 'faculty:140', collection: 'faculty', limitations: ['Faculty-profile course lists are undated.'] };
  const directory = { id: 'contacts:1', collection: 'contacts', derived_from_source_id: 'faculty:140', limitations: [] };
  const root = entity([field('email', 'a@ramapo.edu', { sourceId: 'contacts:1', source: directory }),
    field('phone', '201-684-6232', { sourceId: 'contacts:1', source: directory }),
    field('bio', 'Profile text', { sourceId: 'faculty:140', source: faculty })]);
  const sources = overviewSources(root);
  assert.deepEqual(sources.map(({ label, derivedFrom }) => [label, derivedFrom]), [['Directory entry', 'Faculty profile'], ['Faculty profile', undefined]]);
  assert.deepEqual(sources[1].source.limitations, ['Faculty-profile course lists are undated.']);
  assert.equal(initials('Ali Al-Juboori'), 'AA');
  assert.equal(initials('Computer Science (CMPS)'), 'CC');
  assert.equal(initials('Yolanda del\u00a0Amo'), 'YA');
  assert.equal(shortUrl('https://www.ramapo.edu/snh/faculty/ali-al-juboori/'), 'ramapo.edu/snh/faculty/ali-al-juboori');
});

test('a photo from an allowed site becomes the avatar, and the page policy allows exactly those sites', () => {
  const photo = 'https://www.ramapo.edu/snh/wp-content/uploads/sites/13/2022/01/photo.jpg';
  const image = field('image_url', photo, { category: 'links' });
  const root = { id: 'ali', label: 'Ali Al-Juboori', kind: 'entity', subtitle: 'person', children: [image, field('email', 'a@ramapo.edu', { category: 'contact' })] };
  const fields = overviewFields(root);
  assert.equal(fields.photo, photo);
  assert.deepEqual(fields.hidden.map(({ field, reason }) => [field.propertyKey, reason]), [['image_url', 'Shown as the photo']]);
  assert.equal(fields.contact.length, 1);
  // Another site, an unknown value or a record keeps the link and the initials.
  for (const value of ['https://example.com/photo.jpg', 'http://www.ramapo.edu/photo.jpg', 'not a url']) {
    assert.equal(photoUrl(field('image_url', value, { category: 'links' })), undefined);
  }
  assert.equal(photoUrl(field('image_url', null, { category: 'links', status: 'unknown' })), undefined);
  assert.equal(overviewFields({ ...root, kind: 'record' }).photo, undefined);
  const images = buildContentSecurityPolicy({ nodeEnv: 'production' }).split('; ').find(rule => rule.startsWith('img-src'));
  assert.equal(images, `img-src 'self' data: blob: ${PHOTO_ORIGINS.join(' ')}`);
});

test('named links read as links, and anything else with other keys is left to its own shape', () => {
  const documents = [{ name: 'PDF', url: 'https://www.ramapo.edu/plan.pdf' }, { name: 'Create My Plan (.doc)', url: 'https://www.ramapo.edu/plan.docx' }];
  assert.deepEqual(namedLinks(documents), documents);
  for (const value of [[], null, ['PDF'], [{ name: 'PDF' }], [{ name: 'PDF', url: 'x', size: 1 }], [...documents, 'text']]) assert.equal(namedLinks(value), undefined);
  assert.equal(sourceLabel('graduation_plans'), 'Graduation plan');
});
