'use client';

import { useEffect, useRef } from 'react';
import { AlertCircle, Check, CircleDashed, Loader2, ShieldAlert } from 'lucide-react';
import { describeStep } from '@/lib/chat-stream';
import { readJevRoute } from '@/lib/jev-route';
import type { Turn } from './types';

const ROUTE_TONE: Record<string, string> = {
  code: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  rag: 'border-violet-500/30 bg-violet-500/10 text-violet-300',
  general: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
};

export function TurnList({
  turns,
  selectedId,
  onSelect,
  filtered = false,
  onShowAll,
}: {
  turns: Turn[];
  selectedId?: string;
  onSelect: (localId: string) => void;
  /** Whether `turns` has already been narrowed to the failures. */
  filtered?: boolean;
  onShowAll?: () => void;
}) {
  // Stepping with the arrow keys keeps the picked question in view.
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!selectedId) return;
    listRef.current
      ?.querySelector(`[data-turn-id="${CSS.escape(selectedId)}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [selectedId]);

  // A filter that hides everything must say so and offer the way back, or an
  // empty list reads as a lost session.
  if (turns.length === 0 && filtered) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-sm text-muted-foreground">No turns match this filter.</p>
        {onShowAll && (
          <button
            type="button"
            onClick={onShowAll}
            className="rounded-lg border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            Show every turn
          </button>
        )}
      </div>
    );
  }

  if (turns.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-center">
        <p className="max-w-sm text-sm leading-6 text-muted-foreground">
          Nothing asked yet. Every turn you send is kept whole — the exact request, the exact
          response bytes, and the latency — so you can compare two of them.
        </p>
      </div>
    );
  }

  return (
    <div ref={listRef} className="max-h-[55dvh] flex-1 space-y-2 overflow-y-auto p-4 lg:max-h-none">
      {turns.map((turn) => {
        const selected = turn.localId === selectedId;
        const route = typeof turn.raw?.route === 'string' ? turn.raw.route : undefined;
        const answer = typeof turn.raw?.answer === 'string' ? turn.raw.answer : undefined;
        const step = turn.steps?.[turn.steps.length - 1];
        // The Brain's own verdict: a partial answer is not the same green as a full one.
        const verdict = typeof turn.raw?.status === 'string' ? turn.raw.status : undefined;
        const jev = readJevRoute(turn.raw);
        return (
          <button
            key={turn.localId}
            data-turn-id={turn.localId}
            type="button"
            onClick={() => onSelect(turn.localId)}
            className={`w-full rounded-xl border px-3 py-2.5 text-left transition-colors ${
              selected
                ? 'border-sky-500/40 bg-sky-500/5'
                : 'border-border bg-muted/20 hover:bg-muted/40'
            }`}
          >
            <div className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0">
                {turn.status === 'pending' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                ) : turn.status === 'ok' ? (
                  <Check
                    className={`h-3.5 w-3.5 ${
                      verdict && verdict !== 'answered' ? 'text-amber-400' : 'text-emerald-400'
                    }`}
                  />
                ) : turn.status === 'not_built' ? (
                  // The new Brain's step for this route isn't built yet. Grey, not red.
                  <CircleDashed className="h-3.5 w-3.5 text-muted-foreground" />
                ) : turn.status === 'declined' ? (
                  // The Brain said it couldn't answer. Amber, and a shield rather
                  // than an alarm: nothing broke; its reply shows below.
                  <ShieldAlert className="h-3.5 w-3.5 text-amber-400" />
                ) : (
                  <AlertCircle className="h-3.5 w-3.5 text-red-400" />
                )}
              </span>
              <span className="min-w-0 flex-1 text-sm leading-5 text-foreground">
                {turn.question}
              </span>
            </div>

            {/*
              Nothing is drawn where an answer would be until one arrives. A
              placeholder bubble would be text the brain did not send, which is
              exactly the thing a control room must never show.
            */}
            {/* What the Brain says it is doing: a status line, not an answer. */}
            {turn.status === 'pending' && step && (
              <p className="mt-1.5 truncate pl-5.5 text-xs italic leading-5 text-muted-foreground">
                {describeStep(step).label}…
              </p>
            )}
            {(turn.status === 'ok' || turn.status === 'declined') && answer && (
              <p className="mt-1.5 line-clamp-2 pl-5.5 text-xs leading-5 text-muted-foreground">
                {answer}
              </p>
            )}
            {turn.status === 'not_built' && (
              <p className="mt-1.5 pl-5.5 text-xs leading-5 text-muted-foreground">Not built yet</p>
            )}
            {(turn.status === 'failed' || turn.status === 'declined') && turn.failure && (
              <p
                className={`mt-1.5 font-mono text-xs leading-5 ${
                  turn.status === 'declined' ? 'text-amber-300' : 'text-red-300'
                }`}
              >
                {turn.failure}
              </p>
            )}

            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
              {jev && (
                <span
                  title="The route Jev picked for this question"
                  className="rounded border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.5 font-medium text-sky-300"
                >
                  {jev.label}
                </span>
              )}
              {jev && jev.lowConfidence.length > 0 && (
                <span
                  title="Jev was under 90% sure of these picks; the Brain still followed them"
                  className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 font-medium text-amber-300"
                >
                  under 90%:{' '}
                  {jev.lowConfidence.map((low) => `${low.pick} ${low.percent}%`).join(', ')}
                </span>
              )}
              {route && (
                <span
                  className={`rounded border px-1.5 py-0.5 font-medium ${ROUTE_TONE[route] ?? 'border-white/10'}`}
                >
                  {route}
                </span>
              )}
              {turn.latencyMs !== undefined && (
                <span className="font-mono">{turn.latencyMs} ms</span>
              )}
              {turn.requestId && (
                <span className="truncate font-mono opacity-60">{turn.requestId}</span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
