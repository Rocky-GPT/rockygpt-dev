import assert from 'node:assert/strict';
import test from 'node:test';
import {
  HISTORY_BYTES,
  HISTORY_CHARACTERS,
  HISTORY_MESSAGES,
  buildBody,
  refusesOmittedMessages,
  windowHistory,
  withoutOmittedMessages,
} from '../lib/chat-request.ts';
import { turnOutcome } from '../components/ask/types.ts';

const exchanges = (count, question = (i) => `Question ${i}`, answer = (i) => `Answer ${i}`) =>
  Array.from({ length: count }, (_, i) => [
    { role: 'user', content: question(i) },
    { role: 'assistant', content: answer(i) },
  ]).flat();

const body = (history, next) => {
  const { messages, omittedMessages } = windowHistory(history, next);
  return buildBody({ message: next }, messages, omittedMessages);
};

test('a 30-turn conversation travels whole: Q29 still carries Q4-Q6 (09-29)', () => {
  // The old 40-message window sent only Q10-Q28 with Q29 at 5,229 characters.
  const history = exchanges(28);
  const sent = body(history, 'What did you tell me the first shuttle was?');
  assert.equal(sent.messages.length, 57);
  assert.deepEqual(sent.messages.slice(0, 56), history);
  assert.equal('omittedMessages' in sent, false, 'an older Brain rejects unknown keys');
});

test('past 80 messages the oldest exchanges go, and the Brain is told how many', () => {
  const history = exchanges(45);
  const sent = body(history, 'And now?');
  assert.ok(sent.messages.length <= HISTORY_MESSAGES);
  assert.equal(sent.messages[0].role, 'user', 'a conversation opens with a question');
  assert.equal(sent.messages.at(-1).content, 'And now?');
  assert.equal(sent.omittedMessages, history.length - (sent.messages.length - 1));
  assert.deepEqual(sent.messages.slice(0, -1), history.slice(sent.omittedMessages));
});

test('the character budget leaves out whole messages, never clips one', () => {
  const long = 'x'.repeat(5_000);
  const history = exchanges(6, () => 'Tell me more', () => long);
  const { messages, omittedMessages } = windowHistory(history, 'Go on');
  const characters = messages.reduce((sum, m) => sum + m.content.length, 0) + 'Go on'.length;
  assert.ok(characters <= HISTORY_CHARACTERS);
  assert.ok(messages.every((m) => m.content === long || m.content === 'Tell me more'));
  assert.equal(omittedMessages + messages.length, history.length);
  assert.ok(omittedMessages > 0);
});

test('multibyte history stays under the byte cap the character budget misses (C03)', () => {
  // 22,505 characters but 67,873 JSON bytes: over the Brain's 64 KB body cap.
  const history = exchanges(
    5,
    () => '校'.repeat(500),
    () => '园'.repeat(4_000)
  );
  const sent = body(history, '还有吗？请说');
  const size = new TextEncoder().encode(JSON.stringify(sent)).length;
  assert.ok(size <= HISTORY_BYTES, `${size} bytes`);
  assert.ok(sent.omittedMessages > 0);
  assert.equal(sent.messages[0].role, 'user');
});

test('the omitted count includes an orphaned answer the window had to drop', () => {
  // Room for the last answer but not its question: the answer goes too.
  const history = [
    { role: 'user', content: 'q'.repeat(HISTORY_CHARACTERS - 5) },
    { role: 'assistant', content: 'short' },
  ];
  const sent = body(history, 'Next');
  assert.deepEqual(sent.messages, [{ role: 'user', content: 'Next' }]);
  assert.equal(sent.omittedMessages, 2);
});

test('the outcome is the Brain status, not the HTTP code (09-29)', () => {
  assert.equal(turnOutcome(200, { status: 'answered' }), 'ok');
  assert.equal(turnOutcome(200, { status: 'partial' }), 'ok');
  assert.equal(turnOutcome(200, { status: 'clarification' }), 'ok');
  assert.equal(turnOutcome(200, { status: 'unavailable' }), 'declined');
  assert.equal(turnOutcome(200, undefined), 'ok');
  assert.equal(turnOutcome(429, { status: 'unavailable' }), 'failed');
  assert.equal(turnOutcome(0, undefined), 'failed');
});

test('an older Brain refusing omittedMessages gets the request again without it', () => {
  // FastAPI's own 422 body for an extra field, as a Brain released before 09-29 sends it.
  const refusal = JSON.stringify({
    detail: [{ type: 'extra_forbidden', loc: ['body', 'omittedMessages'], msg: 'Extra inputs are not permitted' }],
  });
  assert.equal(refusesOmittedMessages(refusal), true);
  const body = JSON.stringify({ messages: [{ role: 'user', content: 'Hi' }], omittedMessages: 4 });
  assert.deepEqual(JSON.parse(withoutOmittedMessages(body)), { messages: [{ role: 'user', content: 'Hi' }] });
  // Any other 422 is the Brain's real answer, and a body without the field has nothing to drop.
  const other = JSON.stringify({ detail: [{ type: 'value_error', loc: ['body', 'messages'] }] });
  assert.equal(refusesOmittedMessages(other), false);
  assert.equal(refusesOmittedMessages('not json'), false);
  assert.equal(withoutOmittedMessages(JSON.stringify({ messages: [] })), null);
});
