import 'server-only';
import { brainAddress } from '@/lib/brain-address';
import { FEEDBACK_LIMIT, runTagging, type FeedbackItem } from '@/lib/feedback-tags';
import { loadTags, saveTags } from '@/lib/feedback-tag-store';
import { jevClient } from '@/lib/jev-client';

export const dynamic = 'force-dynamic';

const BRAIN_TIMEOUT_MS = 10_000;

/** One sort at a time, so two presses never pay for the same rows. */
let sorting = false;

function jevKey(): string | null {
  return process.env.TYPESAFE_API_KEY?.trim() || null;
}

/** The saved tags (labels only, never student text) and whether a Jev key is set. */
export async function GET() {
  const store = await loadTags();
  return Response.json({ ...store, jevReady: jevKey() !== null });
}

async function recentFeedback(): Promise<FeedbackItem[] | Response> {
  const { url } = brainAddress();
  if (!url) return Response.json({ error: 'BRAIN_URL is not set.' }, { status: 503 });
  let upstream: Response;
  try {
    upstream = await fetch(`${url}/v1/feedback?limit=${FEEDBACK_LIMIT}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(BRAIN_TIMEOUT_MS),
    });
  } catch {
    return Response.json({ error: 'The Brain could not be reached.' }, { status: 502 });
  }
  const body = (await upstream.json().catch(() => null)) as { feedback?: unknown; error?: unknown } | null;
  if (!upstream.ok || !Array.isArray(body?.feedback)) {
    const error = typeof body?.error === 'string' ? body.error : `The Brain returned HTTP ${upstream.status}.`;
    return Response.json({ error }, { status: 502 });
  }
  return body.feedback as FeedbackItem[];
}

/**
 * Sorts the recent ratings that have no tag yet. Each row is one paid Jev call
 * (about $0.0001); rows without a saved question are tagged without one.
 */
export async function POST() {
  const apiKey = jevKey();
  if (!apiKey) {
    return Response.json(
      { error: 'Add TYPESAFE_API_KEY to rockygpt-dev/.env, then restart npm run dev.' },
      { status: 503 }
    );
  }
  if (sorting) return Response.json({ error: 'A sort is already running.' }, { status: 409 });
  sorting = true;
  try {
    const feedback = await recentFeedback();
    if (feedback instanceof Response) return feedback;
    const store = await loadTags();
    const run = await runTagging(feedback, store.tags, jevClient(apiKey));
    const saved = { tags: { ...store.tags, ...run.tags }, spentNusd: store.spentNusd + run.costNusd };
    await saveTags(saved);
    return Response.json({
      tagged: run.tagged,
      failed: run.failed.length,
      firstError: run.failed[0]?.error ?? null,
      remaining: run.remaining,
      costNusd: run.costNusd,
      stopped: run.stopped,
      ...saved,
    });
  } finally {
    sorting = false;
  }
}
