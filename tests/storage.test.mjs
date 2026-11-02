import assert from 'node:assert/strict';
import test from 'node:test';
import { NEON_FREE_STORAGE_BYTES, formatBytes, limitUsage, releaseBytes } from '../lib/storage.ts';

test('sizes read like the Neon console', () => {
  assert.equal(formatBytes(483_520_000), '483.5 MB');
  assert.equal(formatBytes(NEON_FREE_STORAGE_BYTES), '500 MB');
  assert.equal(formatBytes(1_585_111_806), '1.6 GB');
  assert.equal(formatBytes(12_345), '12.3 kB');
  assert.equal(formatBytes(999), '999 bytes');
  assert.equal(formatBytes(0), '0 bytes');
});

test('the limit warns where Neon does and turns critical near the top', () => {
  assert.equal(limitUsage(300_000_000).level, 'ok');
  assert.equal(limitUsage(400_000_000).level, 'warning');
  const nearlyFull = limitUsage(483_520_000);
  assert.equal(nearlyFull.level, 'critical');
  assert.equal(nearlyFull.remaining, 16_480_000);
  assert.ok(Math.abs(nearlyFull.share - 0.96704) < 1e-9);
});

test('a release is its passages, documents and artifacts together', () => {
  const release = {
    version: 'v2-20260926151351',
    status: 'active',
    createdAt: null,
    activatedAt: null,
    passages: 21721,
    documents: 540,
    artifacts: 26,
    storedBytes: { passages: 34_000_000, documents: 5_000_000, artifacts: 7_000_000 },
  };
  assert.equal(releaseBytes(release), 46_000_000);
});
