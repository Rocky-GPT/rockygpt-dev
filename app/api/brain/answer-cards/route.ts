import { proxyBrainDev } from '@/lib/brain-proxy';

export const dynamic = 'force-dynamic';

// The Brain opens every office page the first time a release is listed (3 seconds on the
// Nov 11 dev graph, about 2,300 pages) and gives itself 30 seconds; later reads are its kept list.
const LISTING_TIMEOUT_MS = 35_000;

/** Every how-to task the laptop Brain's release holds, under its page. */
export function GET() {
  return proxyBrainDev('/v1/dev/answer-cards', '', LISTING_TIMEOUT_MS);
}
