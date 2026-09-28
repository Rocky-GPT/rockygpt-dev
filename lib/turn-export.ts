/**
 * @module lib/turn-export
 * One Ask & Inspect turn as the conversation export writes it.
 *
 * The export is read by whoever debugs the turn later, often an AI with only the
 * file: it has to say when the turn ran, which Brain and release answered, what
 * evidence and drafts were behind the answer, and how long the student waited
 * before seeing anything. The Brain sends the evidence and drafts only to this
 * app (`diagnostics`, development only); everything else is timed here.
 */

import type { Turn } from '@/components/ask/types';

type Json = Record<string, unknown>;

function record(value: unknown): Json | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : undefined;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

/** The Brain's diagnostics: at the top of an answer, inside the Brain's own body on a refusal. */
export function turnDiagnostics(raw: Json | undefined): Json | undefined {
  return record(raw?.diagnostics) ?? record(record(raw?.upstreamResponse)?.diagnostics);
}

/**
 * What the student would first read as an answer, and when: the draft shown while
 * it is checked, else the final answer, else a failure's emergency help.
 */
function firstAnswerText(turn: Turn): { kind: string | null; atMs: number | null } {
  if (turn.draftPreview) return { kind: 'draft_preview', atMs: turn.draftPreview.atMs };
  const atMs = turn.latencyMs ?? null;
  if (turn.status === 'pending') return { kind: null, atMs: null };
  if (text(turn.raw?.answer)) return { kind: 'answer', atMs };
  if (turn.raw?.emergency) return { kind: 'emergency_help', atMs };
  return { kind: null, atMs: null };
}

export function exportTurn(turn: Turn) {
  const diagnostics = turnDiagnostics(turn.raw);
  const brain = record(diagnostics?.brain);
  const first = firstAnswerText(turn);
  return {
    question: turn.question,
    // A bulk run sends each question alone unless history was kept; say so, since a
    // follow-up graded without its history read as the bot forgetting (09-28).
    sentWith:
      turn.request.messages.length > 1
        ? `${turn.request.messages.length - 1} earlier messages`
        : turn.bulk
          ? 'no history (bulk run, each question on its own)'
          : 'no history (first question)',
    status: turn.status,
    httpStatus: turn.httpStatus,
    sentAt: new Date(turn.startedAt).toISOString(),
    finishedAt: turn.finishedAt === undefined ? null : new Date(turn.finishedAt).toISOString(),
    timing: {
      // The first status line the student sees ("Sending your question...").
      firstProgressMs: turn.firstProgressMs ?? null,
      firstAnswerTextMs: first.atMs,
      firstAnswerText: first.kind,
      totalMs: turn.latencyMs ?? null,
      brainElapsedMs: typeof turn.raw?.elapsedMs === 'number' ? turn.raw.elapsedMs : null,
    },
    // Null revision: the Brain wasn't started by the deploy script (run-local.sh's
    // working-tree Brain), or it predates diagnostics.
    brain: {
      revision: text(brain?.revision),
      release: text(brain?.release),
      configurationHash: text(brain?.configurationHash),
      datasetVersion: text(turn.raw?.datasetVersion),
      startedAt: text(diagnostics?.startedAt),
    },
    requestId: turn.requestId,
    steps: turn.steps ?? [],
    draftPreview: turn.draftPreview?.text ?? null,
    request: turn.request,
    // Carries `diagnostics.evidence` (every record the writer and reviewer were given)
    // and `diagnostics.drafts` (each draft as written, with the reviewer's verdicts).
    response: turn.raw,
  };
}
