/**
 * Repeat Test.
 *
 * GET               lists the question sets in the laptop's rockygpt-evals folder.
 * GET ?set=<path>   returns one set's questions (never a frozen set).
 * POST {brain, question} asks one try and returns its reply, read into a WayResult.
 *      The page runs several of these at once (8 on the laptop Brain, 2 on production)
 *      so each try's box fills the moment its answer arrives.
 *
 * Like every page here, this only runs on the laptop (proxy.ts refuses deployments).
 */

import { askTry, listSets, loadSet } from '@/lib/repeat-test-server';
import { MAX_QUESTION_LENGTH } from '@/lib/laptop-vs-production';
import { isRepeatBrain } from '@/lib/repeat-test';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const wanted = new URL(request.url).searchParams.get('set');
  if (!wanted) return Response.json(await listSets());
  const loaded = await loadSet(wanted);
  return Response.json(loaded, { status: 'error' in loaded ? 404 : 200 });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'The request was not JSON.' }, { status: 400 });
  }
  const { brain, question } = (body ?? {}) as { brain?: unknown; question?: unknown };
  if (!isRepeatBrain(brain)) return Response.json({ error: 'Unknown Brain.' }, { status: 400 });
  if (typeof question !== 'string' || !question.trim() || question.length > MAX_QUESTION_LENGTH) {
    return Response.json({ error: `The question must be 1 to ${MAX_QUESTION_LENGTH} characters.` }, { status: 400 });
  }
  return Response.json(await askTry(brain, question.trim(), request.signal));
}
