import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compareResults,
  estimateRun,
  failedReply,
  parseQuestions,
  readEventStream,
  readReply,
  retryable,
} from '../lib/laptop-vs-production.ts';

const body = (overrides = {}) =>
  JSON.stringify({
    answer: 'The Registrar is in D-101. [1]',
    status: 'answered',
    citations: [{ id: 'section-1', title: 'Registrar', url: 'https://www.ramapo.edu/registrar/' }],
    requestId: 'r1',
    datasetVersion: 'v2-20261102040147',
    ...overrides,
  });

test('a JSON reply is read into its answer, status, sources and release', () => {
  const result = readReply('laptop-brain', 200, 'application/json', body(), 17.26);
  assert.equal(result.ok, true);
  assert.equal(result.status, 'answered');
  assert.equal(result.seconds, 17.3);
  assert.equal(result.datasetVersion, 'v2-20261102040147');
  assert.deepEqual(result.citations, [{ title: 'Registrar', url: 'https://www.ramapo.edu/registrar/' }]);
  assert.equal(result.error, null);
});

test("a site's event stream is read from its result event, and its inner status wins", () => {
  const stream =
    'event: progress\ndata: {"stage":"retrieving"}\n\n' +
    `event: result\ndata: ${JSON.stringify({ status: 503, body: { error: { message: 'RockyGPT is starting up.' } } })}\n\n`;
  assert.equal(readEventStream(stream).status, 503);
  const result = readReply('live-site', 200, 'text/event-stream', stream, 2);
  assert.equal(result.ok, false);
  assert.equal(result.http, 503);
  assert.equal(result.error, 'RockyGPT is starting up.');
});

test('a rate limit and an empty answer say so in plain words', () => {
  assert.match(readReply('live-site', 429, 'application/json', '{}', 0).error, /Too many questions/);
  const spent = readReply('laptop-brain', 429, 'application/json', JSON.stringify({
    error: { code: 'budget_exhausted', message: "RockyGPT's monthly AI allowance is exhausted.", retryable: false },
  }), 0);
  assert.equal(spent.error, "RockyGPT's monthly AI allowance is exhausted.");
  assert.equal(retryable(spent), false);
  const busy = readReply('laptop-brain', 429, 'application/json', JSON.stringify({
    error: { code: 'busy', message: 'RockyGPT is busy. Please try again shortly.', retryable: true },
  }), 0);
  assert.equal(retryable(busy), true);
  assert.equal(readReply('laptop-brain', 200, 'application/json', body({ answer: '  ' }), 1).ok, false);
});

const ok = (way, overrides = {}) => readReply(way, 200, 'application/json', body(overrides), 1);

test('same status, release and links agree; different links only mostly agree', () => {
  assert.equal(compareResults([ok('laptop-site'), ok('production-brain')]).kind, 'agree');
  const other = ok('production-brain', {
    citations: [{ title: 'Other', url: 'https://www.ramapo.edu/other/' }],
  });
  const close = compareResults([ok('laptop-site'), other]);
  assert.equal(close.kind, 'close');
  assert.match(close.reasons[0], /0 of 2 links/);
});

test('a different status or release differs, and a failure is not compared', () => {
  const differ = compareResults([ok('laptop-site'), ok('live-site', { status: 'partial' })]);
  assert.equal(differ.kind, 'differ');
  assert.match(differ.reasons[0], /answered on Laptop site; partial on Live site/);
  assert.equal(compareResults([ok('laptop-site'), ok('live-site', { datasetVersion: 'v2-old' })]).kind, 'differ');
  const failed = compareResults([ok('laptop-site'), failedReply('live-site', 'No answer within 180 seconds.', 180)]);
  assert.equal(failed.kind, 'failed');
  assert.deepEqual(failed.reasons, ['Live site: No answer within 180 seconds.']);
});

test('no marker while a way is still asking, or with one way', () => {
  assert.equal(compareResults([ok('laptop-site'), undefined]), null);
  assert.equal(compareResults([ok('laptop-site')]), null);
});

test('questions are read one per line, without comments, numbering or quotes', () => {
  assert.deepEqual(
    parseQuestions('# my list\n1. Where is the Registrar?\n\n- "When does the library close?"\n  Is there a shuttle?  \r\n'),
    ['Where is the Registrar?', 'When does the library close?', 'Is there a shuttle?']
  );
  assert.deepEqual(parseQuestions('Question\n"Where is the gym?"\n2) Who is the dean?'), [
    'Where is the gym?',
    'Who is the dean?',
  ]);
});

test('the estimate counts answers, production answers and minutes', () => {
  const estimate = estimateRun(25, ['laptop-site', 'live-site', 'laptop-brain', 'production-brain']);
  assert.equal(estimate.answers, 100);
  assert.equal(estimate.productionAnswers, 50);
  assert.equal(estimate.dollars.toFixed(2), '0.40');
  assert.equal(estimate.productionDollars.toFixed(2), '0.20');
  assert.equal(estimate.minutes, 10);
});
