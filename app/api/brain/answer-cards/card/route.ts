import { proxyBrainDev } from '@/lib/brain-proxy';

export const dynamic = 'force-dynamic';

// The Brain gives one card 30 seconds: its first read of a release opens every office page.
const CARD_TIMEOUT_MS = 32_000;

/** One answer card in full, and what the bot would say from it, written by code. */
export function GET(request: Request) {
  const incoming = new URL(request.url).searchParams;
  const query = new URLSearchParams();
  for (const key of ['card_id', 'dataset_version', 'identity_hash']) {
    const value = incoming.get(key);
    if (value !== null) query.set(key, value);
  }
  return proxyBrainDev('/v1/dev/answer-cards/card', `?${query}`, CARD_TIMEOUT_MS);
}
