import assert from 'node:assert/strict';
import test from 'node:test';
import { exportTurn } from '../lib/turn-export.ts';

const request = { messages: [{ role: 'user', content: 'Where is the Registrar?' }] };
const startedAt = Date.parse('2026-09-28T21:40:00.000Z');

test('an answered turn says when it ran, which Brain answered and what it read', () => {
  const brain = {
    revision: 'a'.repeat(40),
    release: 'gpt-6-luna-dev',
    configurationHash: 'c'.repeat(64),
  };
  const exported = exportTurn({
    localId: 'one',
    question: 'Where is the Registrar?',
    request,
    requestText: JSON.stringify(request),
    status: 'ok',
    httpStatus: 200,
    startedAt,
    finishedAt: startedAt + 6_400,
    latencyMs: 6_400,
    firstProgressMs: 40,
    steps: [{ stage: 'connecting', subjects: [], atMs: 40 }],
    draftPreview: { text: 'The Registrar is in D-224.', atMs: 4_100 },
    raw: {
      answer: 'The Registrar is in D-224.',
      datasetVersion: 'dev-profiles-names-20260928',
      elapsedMs: 6_300,
      diagnostics: {
        brain,
        startedAt: '2026-09-28T17:40:00-04:00',
        evidence: [{ id: 'contacts:registrar' }],
        drafts: [{ draftCall: 1, outcome: 'accepted', review: [] }],
      },
    },
  });
  assert.equal(exported.sentAt, '2026-09-28T21:40:00.000Z');
  assert.equal(exported.finishedAt, '2026-09-28T21:40:06.400Z');
  assert.deepEqual(exported.timing, {
    firstProgressMs: 40,
    firstAnswerTextMs: 4_100,
    firstAnswerText: 'draft_preview',
    totalMs: 6_400,
    brainElapsedMs: 6_300,
  });
  assert.deepEqual(exported.brain, {
    ...brain,
    datasetVersion: 'dev-profiles-names-20260928',
    startedAt: '2026-09-28T17:40:00-04:00',
  });
  assert.equal(exported.draftPreview, 'The Registrar is in D-224.');
  assert.deepEqual(exported.response.diagnostics.evidence, [{ id: 'contacts:registrar' }]);
});

test("a refusal's emergency help is its first text, and its diagnostics are still read", () => {
  const exported = exportTurn({
    localId: 'two',
    question: 'Someone passed out',
    request,
    requestText: JSON.stringify(request),
    status: 'failed',
    httpStatus: 429,
    startedAt,
    finishedAt: startedAt + 900,
    latencyMs: 900,
    raw: {
      error: 'RockyGPT is currently unavailable.',
      emergency: { text: 'Call 911.' },
      upstreamResponse: { diagnostics: { brain: { revision: 'b'.repeat(40) } } },
    },
  });
  assert.equal(exported.timing.firstAnswerText, 'emergency_help');
  assert.equal(exported.timing.firstAnswerTextMs, 900);
  assert.equal(exported.brain.revision, 'b'.repeat(40));
  assert.equal(exported.brain.datasetVersion, null);
});
