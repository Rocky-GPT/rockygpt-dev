import assert from 'node:assert/strict';
import test from 'node:test';
import {
  IDLE_SYNC,
  applySyncEvent,
  downloadPercent,
  formatBytes,
  parseSyncLine,
  stepStatus,
} from '../lib/production-sync.ts';

const run = (...lines) =>
  lines.map(parseSyncLine).filter(Boolean).reduce(applySyncEvent, IDLE_SYNC);

test('a full sync walks every step to done', () => {
  const state = run(
    '{"step": "checking"}',
    '{"step": "found", "shared": "2026-11-02T04:08:45Z", "total": 39692201}',
    '{"step": "downloading", "received": 19846100, "total": 39692201}'
  );
  assert.equal(state.phase, 'running');
  assert.equal(downloadPercent(state), 50);
  assert.equal(stepStatus(state, 'checking'), 'done');
  assert.equal(stepStatus(state, 'downloading'), 'active');
  assert.equal(stepStatus(state, 'installing'), 'waiting');

  const done = [
    '{"step": "installing"}',
    '{"step": "done", "message": "installed production release v2", "release": "v2-20261102040147"}',
  ].map(parseSyncLine).reduce(applySyncEvent, state);
  assert.equal(done.phase, 'done');
  assert.equal(done.release, 'v2-20261102040147');
  for (const step of ['checking', 'downloading', 'installing', 'done']) {
    assert.equal(stepStatus(done, step), 'done');
  }
});

test('a failure marks the step it happened in', () => {
  const state = run(
    '{"step": "checking"}',
    '{"step": "found", "shared": "t", "total": 10}',
    '{"step": "error", "message": "gh could not download the artifact"}'
  );
  assert.equal(state.phase, 'error');
  assert.equal(state.message, 'gh could not download the artifact');
  assert.equal(stepStatus(state, 'checking'), 'done');
  assert.equal(stepStatus(state, 'downloading'), 'failed');
  assert.equal(stepStatus(state, 'installing'), 'waiting');
});

test('lines that are not step events are ignored', () => {
  assert.equal(parseSyncLine('production data: up to date'), null);
  assert.equal(parseSyncLine('{"step": "rm -rf"}'), null);
  assert.equal(parseSyncLine('{not json'), null);
});

test('sizes read in plain units', () => {
  assert.equal(formatBytes(39692201), '37.9 MB');
  assert.equal(formatBytes(null), '—');
  assert.equal(downloadPercent({ ...IDLE_SYNC, total: null }), null);
});
