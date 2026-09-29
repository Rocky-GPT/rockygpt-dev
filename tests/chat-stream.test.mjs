import assert from 'node:assert/strict';
import test from 'node:test';
import { ChatStreamError, readChatStream } from '../lib/chat-stream.ts';

const stream = (...events) =>
  new Response(
    events.map(([name, data]) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`).join(''),
    { headers: { 'content-type': 'text/event-stream' } }
  );

test('early emergency guidance arrives with its progress step (09-29)', async () => {
  const updates = [];
  const result = await readChatStream(
    stream(
      ['progress', { stage: 'connecting' }],
      [
        'progress',
        {
          stage: 'understanding',
          subjects: [],
          safety: { answer: "If you're in danger right now, call 911.", citations: [] },
        },
      ],
      ['progress', { stage: 'retrieving', subjects: [], safety: 'not an object' }],
      ['progress', { safety: { answer: 'no stage' } }],
      ['result', { status: 200, body: { status: 'answered', answer: 'Call 911.' } }]
    ),
    (update) => updates.push(update)
  );
  assert.deepEqual(
    updates.map((update) => [update.stage, update.safety?.answer]),
    [
      ['connecting', undefined],
      ['understanding', "If you're in danger right now, call 911."],
      ['retrieving', undefined],
    ]
  );
  assert.deepEqual(result, { status: 200, body: { status: 'answered', answer: 'Call 911.' } });
});

test('a malformed result is an interrupted stream, not an empty answer', async () => {
  for (const result of [
    { status: 200 },
    { status: 200, body: null },
    { status: 200, body: 'text' },
    { status: 200.5, body: {} },
    { status: 999, body: {} },
    { status: 199, body: {} },
    { status: '200', body: {} },
  ]) {
    await assert.rejects(
      readChatStream(stream(['result', result]), () => undefined),
      ChatStreamError,
      JSON.stringify(result)
    );
  }
  const failure = await readChatStream(
    stream(['result', { status: 503, body: { error: 'down' } }]),
    () => undefined
  );
  assert.deepEqual(failure, { status: 503, body: { error: 'down' } });
});
