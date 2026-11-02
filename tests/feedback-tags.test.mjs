import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  INPUT_NUSD_PER_TOKEN,
  JEV_MODEL,
  JevError,
  MAX_TEXT_CHARS,
  TAG_VERSION,
  fingerprint,
  formatUsd,
  freshTag,
  jevRequest,
  readAnswers,
  reasonOf,
  runTagging,
  summarize,
  tagFrom,
} from '../lib/feedback-tags.ts';
import { loadTags, saveTags } from '../lib/feedback-tag-store.ts';
import { JEV_URL, jevClient } from '../lib/jev-client.ts';

// Jev is mocked throughout: no test makes a paid call.

let nextId = 0;
function rating(overrides = {}) {
  nextId += 1;
  return {
    id: `f${nextId}`,
    requestId: `00000000-0000-4000-8000-${String(nextId).padStart(12, '0')}`,
    question: 'When does the shuttle leave for the train station?',
    answer: 'The shuttle leaves Lot C every 30 minutes from 7 AM.',
    rating: -1,
    category: null,
    comments: null,
    createdAt: '2026-09-26T15:00:00Z',
    ...overrides,
  };
}

function answer(criteria, choice, probability = 0.95, confidence = 0.95) {
  const keys = Object.keys(criteria);
  const rest = (1 - probability) / (keys.length - 1);
  return {
    type: 'choice',
    choice,
    confidence,
    probabilities: Object.fromEntries(keys.map((key) => [key, key === choice ? probability : rest])),
  };
}

/** A well-formed Jev reply picking `picks[key]` for each question asked. */
function reply(request, picks, inputTokens = 900) {
  return {
    model: JEV_MODEL,
    inputTokens,
    answers: Object.fromEntries(
      Object.entries(request.questions).map(([key, question]) => [key, answer(question.criteria, picks[key])])
    ),
  };
}

function mockJev(picks = { topic: 'transport', reason: 'outdated' }) {
  const calls = [];
  const ask = async (request) => {
    calls.push(request);
    return reply(request, picks);
  };
  return { ask, calls };
}

test('a thumbs up asks only for a topic; a thumbs down with no reason also asks why', () => {
  const up = jevRequest(rating({ rating: 1 }));
  assert.deepEqual(Object.keys(up.questions), ['topic']);
  assert.equal(up.model, 'jev-1.13.0');
  assert.equal(up.state.rating, 'thumbs up');

  const skipped = jevRequest(rating());
  assert.deepEqual(Object.keys(skipped.questions), ['topic', 'reason']);
  assert.ok('unresolved' in skipped.questions.reason.criteria);
  assert.deepEqual(
    Object.keys(skipped.questions.reason.criteria),
    ['inaccurate', 'incomplete', 'outdated', 'could_be_better', 'unresolved']
  );

  const other = jevRequest(rating({ category: 'other', comments: 'the times changed this fall' }));
  assert.ok('reason' in other.questions);
  assert.equal(other.state.student_comment, 'the times changed this fall');
});

test("a reason the student picked is kept, and Jev isn't asked for one", () => {
  const item = rating({ category: 'outdated', comments: 'wrong semester' });
  assert.deepEqual(Object.keys(jevRequest(item).questions), ['topic']);
  assert.deepEqual(reasonOf(item, undefined), { reason: 'outdated', byJev: false });
});

test("an operator review's fixed note is never sent as the student's comment", () => {
  const request = jevRequest(rating({ category: 'operator_review', comments: 'Reviewed in Dev Control Room' }));
  assert.equal(request.state.student_comment, null);
  assert.ok('reason' in request.questions);
});

test('long text is cut before Jev reads it', () => {
  const request = jevRequest(rating({ answer: 'x'.repeat(MAX_TEXT_CHARS + 500) }));
  assert.ok(request.state.assistant_answer.length < MAX_TEXT_CHARS + 20);
  assert.ok(request.state.assistant_answer.endsWith('…[cut]'));
});

test("Jev's answers are refused unless they add up", () => {
  const request = jevRequest(rating());
  const good = reply(request, { topic: 'transport', reason: 'outdated' }).answers;
  assert.equal(readAnswers(good, request.questions).topic.choice, 'transport');

  const missing = { topic: good.topic };
  assert.throws(() => readAnswers(missing, request.questions), /every question/);

  const extraOption = structuredClone(good);
  extraOption.topic.probabilities.parking_tickets = 0;
  assert.throws(() => readAnswers(extraOption, request.questions), /not asked/);

  const badSum = structuredClone(good);
  badSum.topic.probabilities.dining = 0.5;
  assert.throws(() => readAnswers(badSum, request.questions), /inconsistent/);

  const notTop = structuredClone(good);
  notTop.topic.choice = 'dining';
  assert.throws(() => readAnswers(notTop, request.questions), /inconsistent/);

  const outOfRange = structuredClone(good);
  outOfRange.topic.confidence = 1.5;
  assert.throws(() => readAnswers(outOfRange, request.questions), /probability/);

  assert.throws(() => readAnswers(null, request.questions), /every question/);
});

test('an unsure or unresolved pick reads as unsure', () => {
  const item = rating();
  const request = jevRequest(item);
  const answers = reply(request, { topic: 'transport', reason: 'unresolved' }).answers;
  answers.topic.confidence = 0.4;
  const tag = tagFrom(item, readAnswers(answers, request.questions), '2026-09-27T00:00:00Z');
  assert.equal(tag.topic, 'unsure');
  assert.equal(tag.topicConfidence, 0.4);
  assert.equal(tag.reason, 'unsure');
  assert.equal(tag.version, TAG_VERSION);
});

test('a run sorts only new or changed rows and counts what Jev bills', async () => {
  const kept = rating({ rating: 1 });
  const changed = rating({ category: 'other', comments: 'hours are wrong' });
  const fresh = rating();
  const noText = rating({ question: 'N/A', answer: 'N/A' });
  const stale = { ...changed, comments: null, category: null };
  const existing = {
    [kept.id]: {
      version: TAG_VERSION,
      fingerprint: fingerprint(kept),
      topic: 'dining',
      topicConfidence: 0.97,
      reason: null,
      reasonConfidence: null,
      taggedAt: '2026-09-26T00:00:00Z',
    },
    // Tagged before the student typed a comment.
    [changed.id]: {
      version: TAG_VERSION,
      fingerprint: fingerprint(stale),
      topic: 'transport',
      topicConfidence: 0.9,
      reason: 'unsure',
      reasonConfidence: 0.3,
      taggedAt: '2026-09-26T00:00:00Z',
    },
  };
  const { ask, calls } = mockJev();
  const run = await runTagging([kept, changed, fresh, noText], existing, ask);

  assert.equal(calls.length, 2, 'the unchanged row and the row with no question cost nothing');
  assert.deepEqual(Object.keys(run.tags).sort(), [changed.id, fresh.id, noText.id].sort());
  assert.equal(run.tags[changed.id].reason, 'outdated');
  assert.equal(run.tags[noText.id].topic, 'no_text');
  assert.equal(run.tagged, 3);
  assert.equal(run.remaining, 0);
  assert.equal(run.costNusd, 2 * 900 * INPUT_NUSD_PER_TOKEN);
  assert.equal(run.stopped, null);
  assert.ok(freshTag(changed, run.tags));
});

test('one press sorts at most the cap and leaves the rest for later', async () => {
  const rows = Array.from({ length: 5 }, () => rating());
  const { ask, calls } = mockJev();
  const run = await runTagging(rows, {}, ask, { max: 2 });
  assert.equal(calls.length, 2);
  assert.equal(run.tagged, 2);
  assert.equal(run.remaining, 3);
});

test('a refused key stops the run instead of paying for every row', async () => {
  let calls = 0;
  const ask = async () => {
    calls += 1;
    throw new JevError('Jev returned HTTP 401', true);
  };
  const run = await runTagging([rating(), rating(), rating()], {}, ask, { concurrency: 1 });
  assert.equal(calls, 1);
  assert.equal(run.stopped, 'Jev returned HTTP 401');
  assert.equal(run.remaining, 3);
  assert.equal(run.costNusd, 0);
});

test('a slow or broken answer fails that row only', async () => {
  let calls = 0;
  const ask = async (request) => {
    calls += 1;
    if (calls === 1) throw new JevError('Jev did not answer within 15 seconds');
    return reply(request, { topic: 'transport', reason: 'incomplete' });
  };
  const run = await runTagging([rating(), rating()], {}, ask, { concurrency: 1 });
  assert.equal(run.tagged, 1);
  assert.equal(run.failed.length, 1);
  assert.equal(run.remaining, 1);
  assert.equal(run.stopped, null);
});

test('a reply from another model is billed but not used, and stops the run', async () => {
  const ask = async (request) => ({ ...reply(request, { topic: 'dining', reason: 'outdated' }), model: 'jev-2.0.0' });
  const run = await runTagging([rating(), rating()], {}, ask, { concurrency: 1 });
  assert.equal(run.tagged, 0);
  assert.match(run.stopped, /jev-2\.0\.0/);
  assert.equal(run.costNusd, 900 * INPUT_NUSD_PER_TOKEN);
});

test('the summary puts the most thumbs down first and leaves out operator reviews', () => {
  const shuttleDown = rating({ category: 'other', comments: 'old times' });
  const shuttleDown2 = rating();
  const diningUp = rating({ rating: 1 });
  const diningDown = rating({ category: 'inaccurate' });
  const review = rating({ category: 'operator_review' });
  const unsorted = rating({ category: 'outdated' });
  const unclear = rating({ rating: 1 });
  const unclear2 = rating({ rating: 1 });
  const unclear3 = rating();
  const tag = (item, topic, reason = null) => ({
    version: TAG_VERSION,
    fingerprint: fingerprint(item),
    topic,
    topicConfidence: 0.95,
    reason,
    reasonConfidence: reason ? 0.95 : null,
    taggedAt: '2026-09-27T00:00:00Z',
  });
  const tags = {
    [shuttleDown.id]: tag(shuttleDown, 'transport', 'outdated'),
    [shuttleDown2.id]: tag(shuttleDown2, 'transport', 'incomplete'),
    [diningUp.id]: tag(diningUp, 'dining'),
    [diningDown.id]: tag(diningDown, 'dining'),
    [review.id]: tag(review, 'transport', 'inaccurate'),
    [unclear.id]: tag(unclear, 'unsure'),
    [unclear2.id]: tag(unclear2, 'unsure'),
    [unclear3.id]: tag(unclear3, 'unsure', 'unsure'),
  };
  const summary = summarize(
    [shuttleDown, shuttleDown2, diningUp, diningDown, review, unsorted, unclear, unclear2, unclear3],
    tags
  );

  assert.equal(summary.students, 8);
  assert.equal(summary.sorted, 7);
  // Unsure sits below the real topics even with more ratings.
  assert.deepEqual(summary.topics, [
    { topic: 'transport', down: 2, up: 0 },
    { topic: 'dining', down: 1, up: 1 },
    { topic: 'unsure', down: 1, up: 2 },
  ]);
  // The student's own pick counts even before sorting; Jev's picks are marked.
  assert.deepEqual(summary.reasons, [
    { reason: 'outdated', count: 2, byJev: 1 },
    { reason: 'inaccurate', count: 1, byJev: 0 },
    { reason: 'incomplete', count: 1, byJev: 1 },
    { reason: 'unsure', count: 1, byJev: 1 },
  ]);
});

test('the Jev client sends the pinned request with the key and reads usage', async () => {
  let seen;
  const fetchImpl = async (url, init) => {
    seen = { url, init };
    return new Response(
      JSON.stringify({ id: 'r1', model: JEV_MODEL, answers: { topic: {} }, usage: { input_tokens: 812, output_tokens: 3 } }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  };
  const request = jevRequest(rating());
  const result = await jevClient('test-key', { fetchImpl })(request);
  assert.equal(seen.url, JEV_URL);
  assert.equal(seen.init.method, 'POST');
  assert.equal(seen.init.headers.Authorization, 'Bearer test-key');
  assert.deepEqual(JSON.parse(seen.init.body), request);
  assert.deepEqual(result, { model: JEV_MODEL, answers: { topic: {} }, inputTokens: 812 });
});

test('the Jev client stops on a refused key but not on a one-off server error', async () => {
  const status = (code) => async () => new Response('{}', { status: code });
  await assert.rejects(jevClient('k', { fetchImpl: status(401) })(jevRequest(rating())), (error) => {
    assert.ok(error instanceof JevError);
    assert.equal(error.fatal, true);
    return true;
  });
  await assert.rejects(jevClient('k', { fetchImpl: status(500) })(jevRequest(rating())), (error) => {
    assert.equal(error.fatal, false);
    return true;
  });
  const noUsage = async () => new Response(JSON.stringify({ model: JEV_MODEL, answers: {} }), { status: 200 });
  const result = await jevClient('k', { fetchImpl: noUsage })(jevRequest(rating()));
  assert.equal(result.inputTokens, null);
});

test('the tag file keeps no student words', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'feedback-tags-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, '.data', 'feedback-tags.json');

  assert.deepEqual(await loadTags(file), { tags: {}, spentNusd: 0 });

  const item = rating({ category: 'other', comments: 'my RA told me something different' });
  const { ask } = mockJev();
  const run = await runTagging([item], {}, ask);
  await saveTags({ tags: run.tags, spentNusd: run.costNusd }, file);

  const text = await readFile(file, 'utf8');
  assert.ok(!text.includes('shuttle'));
  assert.ok(!text.includes('Lot C'));
  assert.ok(!text.includes('my RA'));
  assert.deepEqual(await loadTags(file), { tags: run.tags, spentNusd: run.costNusd });
});

test('costs read in dollars', () => {
  assert.equal(formatUsd(0), '$0');
  assert.equal(formatUsd(900 * 42), 'under $0.0001');
  assert.equal(formatUsd(4_200_000), '$0.0042');
  assert.equal(formatUsd(123_000_000), '$0.12');
});
