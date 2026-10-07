import assert from 'node:assert/strict';
import test from 'node:test';
import { plainPreview } from '../lib/markdown-preview.ts';

// The answer as the Brain sent it for the Financial Aid question.
const FINANCIAL_AID = [
  '**Financial Aid**',
  'Name (dated observation; current value unverified): Financial Aid [campus-directory](https://www.ramapo.edu/finaid/) (stale capture; captured 2026-09-23T18:39:39.952000-04:00)',
  'Email: finaid@ramapo.edu [campus-directory](https://www.ramapo.edu/finaid/)',
  'Phones: +12016847549 [campus-directory](https://www.ramapo.edu/finaid/)',
  'Offices: E-210 [campus-directory](https://www.ramapo.edu/finaid/)',
].join('\n\n');

test('a real answer reads as plain text: no asterisks, brackets or addresses, nothing reworded', () => {
  assert.equal(plainPreview(FINANCIAL_AID),
    'Financial Aid · Name (dated observation; current value unverified): Financial Aid campus-directory '
    + '(stale capture; captured 2026-09-23T18:39:39.952000-04:00) · Email: finaid@ramapo.edu campus-directory · '
    + 'Phones: +12016847549 campus-directory · Offices: E-210 campus-directory');
});

test('every word of the answer is still there; only the symbols are gone', () => {
  const words = (text) => text.replace(/[^\p{L}\p{N}@.:+\-]+/gu, ' ').trim().split(/\s+/);
  const kept = new Set(words(plainPreview(FINANCIAL_AID)));
  for (const word of words(FINANCIAL_AID.replace(/\]\([^)]*\)/g, ''))) assert.ok(kept.has(word), word);
});

test('links keep their label, titles and images are dropped, autolinks keep the address', () => {
  assert.equal(plainPreview('See [the Registrar](https://example.edu/reg "Registrar page") now'), 'See the Registrar now');
  assert.equal(plainPreview('Map ![campus map](https://example.edu/m.png) here'), 'Map campus map here');
  assert.equal(plainPreview('Write <mailto:reg@example.edu> today'), 'Write mailto:reg@example.edu today');
  assert.equal(plainPreview('Open <https://example.edu/x> now'), 'Open https://example.edu/x now');
  assert.equal(plainPreview('A [label with (parens)](https://example.edu/a)'), 'A label with (parens)');
});

test('bold, italics, strike and code lose their markers', () => {
  assert.equal(plainPreview('**bold** and *italic* and __bold__ and _italic_ and ~~gone~~ and `code`'),
    'bold and italic and bold and italic and gone and code');
});

test('words that merely contain markers are left alone', () => {
  assert.equal(plainPreview('Email first_last@example.edu or snake_case_name'), 'Email first_last@example.edu or snake_case_name');
  assert.equal(plainPreview('2 * 3 = 6 and a*b*c'), '2 * 3 = 6 and a*b*c');
  assert.equal(plainPreview('An unmatched **marker stays'), 'An unmatched **marker stays');
});

test('escaped characters come back as themselves', () => {
  assert.equal(plainPreview('Price \\*not\\* bold, 5\\.0 \\[x\\]'), 'Price *not* bold, 5.0 [x]');
});

test('headings, quotes and bullets lose their leading marks; paragraphs are joined with a dot', () => {
  assert.equal(plainPreview('# Title\n\n> quoted line\n\n- first\n- second\n\n1. numbered'),
    'Title · quoted line · first second · 1. numbered');
});

test('lines inside a paragraph join with a space, and blank or empty input is empty', () => {
  assert.equal(plainPreview('one\ntwo\r\nthree'), 'one two three');
  assert.equal(plainPreview(''), '');
  assert.equal(plainPreview('  \n\n  \n'), '');
  assert.equal(plainPreview('plain text'), 'plain text');
});
