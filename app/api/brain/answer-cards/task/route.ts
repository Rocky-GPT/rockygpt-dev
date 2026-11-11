import { proxyBrainDev } from '@/lib/brain-proxy';

export const dynamic = 'force-dynamic';

// The Brain gives one task 10 seconds.
const TASK_TIMEOUT_MS = 12_000;

/** One task in full: each step beside the page's own words. */
export function GET(request: Request) {
  const incoming = new URL(request.url).searchParams;
  const query = new URLSearchParams();
  for (const key of ['node_id', 'record_id', 'key', 'dataset_version', 'identity_hash']) {
    const value = incoming.get(key);
    if (value !== null) query.set(key, value);
  }
  return proxyBrainDev('/v1/dev/answer-cards/task', `?${query}`, TASK_TIMEOUT_MS);
}
