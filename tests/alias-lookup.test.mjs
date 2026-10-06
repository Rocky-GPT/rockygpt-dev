import assert from 'node:assert/strict';
import test from 'node:test';
import { lookupProblem, lookupToShow, outcomeSentence } from '../lib/alias-lookup.ts';

const candidate = (entityId, name, match) => ({ entityId, name, match });
const result = (extra) => ({
  query: 'q',
  datasetVersion: 'v',
  identityHash: 'h',
  truncated: false,
  candidates: [],
  ...extra,
});

test('an answer names the office the Brain chose, by its candidate name', () => {
  const found = result({
    outcome: 'answers',
    chosen: ['e1'],
    candidates: [candidate('e1', 'Registrar', 'partial')],
  });
  assert.equal(outcomeSentence(found), 'The lookup would use Registrar.');
});

test('an answer with no matching candidate shows the Brain\'s own value, and with none says so', () => {
  assert.equal(outcomeSentence(result({ outcome: 'answers', chosen: ['x'] })), 'The lookup would use x.');
  assert.match(outcomeSentence(result({ outcome: 'answers', chosen: [] })), /did not name the office/);
});

test('asking and finding nothing each get their own sentence', () => {
  assert.match(outcomeSentence(result({ outcome: 'asks', chosen: [] })), /asks which one/);
  assert.match(outcomeSentence(result({ outcome: 'not_found', chosen: [] })), /found no matching office/);
});

test('a Brain that returns no outcome is not guessed for', () => {
  const sentence = outcomeSentence(result({}));
  assert.match(sentence, /did not say what the lookup would do/);
  assert.doesNotMatch(sentence, /would use|asks/);
});

test('a result is shown only for the text it answers', () => {
  const done = { state: 'done', query: 'career center', result: result({ outcome: 'not_found' }) };
  assert.equal(lookupToShow(done, 'career center'), done);
  assert.deepEqual(lookupToShow(done, 'career centers'), { state: 'searching' });
  assert.deepEqual(lookupToShow({ state: 'idle' }, 'career'), { state: 'searching' });
  assert.deepEqual(lookupToShow(done, ''), { state: 'idle' });
  const failed = { state: 'failed', query: 'a', problem: 'p' };
  assert.equal(lookupToShow(failed, 'a'), failed);
  assert.deepEqual(lookupToShow(failed, 'b'), { state: 'searching' });
});

test('an over-long query says the limit, other failures keep the Brain\'s own message', () => {
  assert.match(lookupProblem(422, { error: 'The request field is invalid.' }), /1 to 200 characters/);
  assert.equal(lookupProblem(503, { error: 'Campus data is unavailable.' }), 'Campus data is unavailable.');
  assert.equal(lookupProblem(500, 'oops'), 'The Brain answered HTTP 500.');
  assert.equal(lookupProblem(500, null), 'The Brain answered HTTP 500.');
});
