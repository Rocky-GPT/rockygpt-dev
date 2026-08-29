'use client';

import { AlertCircle, Check, Loader2 } from 'lucide-react';
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
}: {
  turns: Turn[];
  selectedId?: string;
  onSelect: (localId: string) => void;
}) {
  if (turns.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-center">
        <p className="max-w-sm text-sm leading-6 text-muted-foreground">
          Nothing asked yet. Every turn you send is kept whole — the exact
          request, the exact response bytes, and the latency — so you can compare
          two of them.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-2 overflow-y-auto p-4">
      {turns.map((turn) => {
        const selected = turn.localId === selectedId;
        const route = typeof turn.raw?.route === 'string' ? turn.raw.route : undefined;
        const answer = typeof turn.raw?.answer === 'string' ? turn.raw.answer : undefined;

        return (
          <button
            key={turn.localId}
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
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
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
            {turn.status === 'ok' && answer && (
              <p className="mt-1.5 line-clamp-2 pl-5.5 text-xs leading-5 text-muted-foreground">
                {answer}
              </p>
            )}
            {turn.status === 'failed' && turn.failure && (
              <p className="mt-1.5 font-mono text-xs leading-5 text-red-300">{turn.failure}</p>
            )}

            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
              {route && (
                <span className={`rounded border px-1.5 py-0.5 font-medium ${ROUTE_TONE[route] ?? 'border-white/10'}`}>
                  {route}
                </span>
              )}
              {turn.latencyMs !== undefined && <span className="font-mono">{turn.latencyMs} ms</span>}
              {turn.requestId && <span className="truncate font-mono opacity-60">{turn.requestId}</span>}
            </div>
          </button>
        );
      })}
    </div>
  );
}
