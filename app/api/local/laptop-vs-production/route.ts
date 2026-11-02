/**
 * Laptop vs Production's one ask.
 *
 * GET  says where each way asks.
 * POST {way, question} asks that one way and returns its reply, read into a
 *      WayResult. The page asks each way as its own request, so each column
 *      fills the moment its answer arrives.
 *
 * Production asks share one gate of 2 at a time (lib/laptop-vs-production-server.ts). Like
 * every page here, this only runs on the laptop (proxy.ts refuses deployments).
 */

import { askWay, wayAddresses } from '@/lib/laptop-vs-production-server';
import { COST_PER_ANSWER, MAX_QUESTION_LENGTH, PRODUCTION_AT_ONCE, isWayId } from '@/lib/laptop-vs-production';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export function GET() {
  return Response.json({
    addresses: wayAddresses(),
    productionAtOnce: PRODUCTION_AT_ONCE,
    costPerAnswer: COST_PER_ANSWER,
  });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'The request was not JSON.' }, { status: 400 });
  }
  const { way, question } = (body ?? {}) as { way?: unknown; question?: unknown };
  if (!isWayId(way)) return Response.json({ error: 'Unknown way.' }, { status: 400 });
  if (typeof question !== 'string' || !question.trim() || question.length > MAX_QUESTION_LENGTH) {
    return Response.json(
      { error: `The question must be 1 to ${MAX_QUESTION_LENGTH} characters.` },
      { status: 400 }
    );
  }
  return Response.json(await askWay(way, question.trim(), request.signal));
}
