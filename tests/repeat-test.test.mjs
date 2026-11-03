import assert from 'node:assert/strict';
import test from 'node:test';
import { failedReply } from '../lib/laptop-vs-production.ts';
import {
  answerFacts,
  estimateRepeat,
  groupTries,
  isFlaky,
  isFrozen,
  pastedQuestions,
  readSetFile,
  spentDollars,
  verdictFor,
} from '../lib/repeat-test.ts';

const reply = (answer, overrides = {}) => ({
  way: 'laptop-brain',
  ok: true,
  http: 200,
  seconds: 12,
  status: 'answered',
  answer,
  citations: [{ title: 'Calendar', url: 'https://www.ramapo.edu/calendar/#tonight' }],
  datasetVersion: 'v2',
  requestId: 'r',
  error: null,
  raw: null,
  ...overrides,
});

const EVENTS = "Here's what's on tonight, Nov 3:\n- **Open Mic Night**, 7 PM, Pavilion\n- **Trivia Tuesday**, 8:00 p.m., Friends Hall [1]";

test('facts: times, dates, phones, emails, rooms, prices and list names, normalized', () => {
  const facts = answerFacts(
    `${EVENTS}\nCall (201) 684-7500 or email registrar@ramapo.edu. Room D-101. Fee $45. Up to 18 credits.`
  );
  for (const fact of [
    'date nov 3',
    'item open mic night',
    'item trivia tuesday',
    'time 7:00pm',
    'time 8:00pm',
    'phone 2016847500',
    'email registrar@ramapo.edu',
    'room d-101',
    '$ 45.00',
    'number 18',
  ]) {
    assert.ok(facts.includes(fact), `missing ${fact} in ${facts.join(' | ')}`);
  }
  assert.ok(!facts.includes('number 1'), 'a citation marker is not a fact');
});

test('the wording does not count, the facts do', () => {
  const same = answerFacts("Tonight (November 3rd) you've got:\n* **Open Mic Night** at 7pm in the Pavilion\n* **Trivia Tuesday**: 8 PM");
  assert.deepEqual(same, answerFacts(EVENTS).filter((fact) => fact !== 'room d-101'));
});

test('tries group by answer, most common first, failures marked X', () => {
  const cut = "Here's what's on tonight, Nov 3:\n- **Open Mic Night**, 7 PM, Pavilion";
  const grouping = groupTries([
    reply(EVENTS),
    reply(cut),
    reply(EVENTS.replace('Here', 'So here')),
    failedReply('laptop-brain', 'No answer within 180 seconds.', 180),
    reply(cut),
    reply(EVENTS),
    undefined,
  ]);
  assert.deepEqual(grouping.letters, ['A', 'B', 'A', 'X', 'B', 'A', null]);
  assert.deepEqual(grouping.groups.map((group) => group.tries), [[0, 2, 5], [1, 4]]);
  assert.match(grouping.groups[1].differences.join(' '), /List leaves out 1 name: trivia tuesday/);
  assert.deepEqual(grouping.failed, [3]);
});

test('a different section of the same page is the same source; another page is not', () => {
  const grouping = groupTries([
    reply(EVENTS),
    reply(EVENTS, { citations: [{ title: 'c', url: 'https://www.ramapo.edu/calendar' }] }),
    reply(EVENTS, { citations: [{ title: 'e', url: 'https://www.ramapo.edu/events/' }] }),
  ]);
  assert.deepEqual(grouping.letters, ['A', 'A', 'B']);
  assert.match(grouping.groups[1].differences[0], /Sources differ/);
});

test("verdicts: Dan's rule, 2 or more off out of 5 is flaky", () => {
  const five = (answers) => verdictFor(groupTries(answers.map((a) => (a ? reply(a) : undefined))), 5, 0);
  assert.equal(five(['x 1', 'x 1', 'x 1', 'x 1', 'x 1']).label, 'Steady');
  assert.equal(five(['x 1', 'x 1', 'x 1', 'x 1', 'x 2']).label, '1 off');
  assert.equal(five(['x 1', 'x 1', 'x 1', 'x 2', 'x 2']).kind, 'flaky');
  assert.equal(five(['x 1', 'x 1', 'x 1', 'x 2', undefined]).kind, 'asking');
  assert.equal(isFlaky(3, 10), false);
  assert.equal(isFlaky(4, 10), true);
  const failures = Array.from({ length: 5 }, () => failedReply('laptop-brain', 'down', 0));
  assert.equal(verdictFor(groupTries(failures), 5, 0).kind, 'failed');
  const twoFailed = [reply('x 1'), reply('x 1'), reply('x 1'), ...failures.slice(0, 2)];
  assert.equal(verdictFor(groupTries(twoFailed), 5, 0).kind, 'flaky');
});

test('estimate: answers, dollars, minutes at the Brain\'s pace, loud over $1', () => {
  const laptop = estimateRepeat(44, 5, 'laptop-brain');
  assert.equal(laptop.answers, 220);
  assert.equal(laptop.dollars.toFixed(2), '0.22');
  assert.equal(laptop.minutes, 7);
  assert.equal(laptop.loud, false);
  assert.equal(estimateRepeat(60, 5, 'laptop-brain').loud, false);
  assert.equal(estimateRepeat(60, 20, 'laptop-brain').loud, true);
  assert.equal(estimateRepeat(10, 5, 'production-brain').atOnce, 2);
});

test('real spend comes from the metrics, in billionths of a dollar', () => {
  assert.equal(spentDollars(reply('x', { raw: { metrics: { committedNusd: 3_500_000 } } })), 0.0035);
  assert.equal(spentDollars(reply('x')), null);
});

test('set files: a JSON list keeps ids and good replies; a text file is one per line', () => {
  const json = JSON.stringify([
    { id: 'p-1', question: 'yo', good_reply: 'A hello.', must_not: 'Facts.' },
    { id: 'p-2', question: 'where is d' },
  ]);
  assert.deepEqual(readSetFile('practice.json', json)[0], { id: 'p-1', question: 'yo', goodReply: 'A hello.', mustNot: 'Facts.' });
  assert.deepEqual(readSetFile('turns.json', JSON.stringify([{ role: 'user' }])), []);
  assert.deepEqual(
    readSetFile('questions.txt', '# comment\n1. Who is Amruth Kumar?\n\n- "Where is D?"').map((q) => q.question),
    ['Who is Amruth Kumar?', 'Where is D?']
  );
  assert.equal(pastedQuestions('a\nb')[1].id, 'q2');
});

test('frozen sets are known by their file name', () => {
  assert.equal(isFrozen('fresh-2026-11-03/check-frozen.json'), true);
  assert.equal(isFrozen('tonight-2026-11-02/blind-four-areas/questions-frozen.json'), true);
  assert.equal(isFrozen('fresh-2026-11-03/practice.json'), false);
});
