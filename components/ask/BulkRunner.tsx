'use client';

import { Square } from 'lucide-react';
import type { TurnOutcome } from './types';

export interface BulkProgress {
  running: boolean;
  asked: number;
  /** The system broke. */
  failed: number;
  /** A guard refused. Counted apart, because it is not the same news. */
  declined: number;
  total: number;
  stop: () => void;
  stopped?: boolean;
}

export function BulkRunner({
  progress,
  shown,
  onShowOnly,
}: {
  progress: BulkProgress;
  /** The outcomes currently on screen, so a chip can show it is the only one. */
  shown: ReadonlySet<TurnOutcome>;
  /** The counts are where the eye already is, so they are also the control. */
  onShowOnly: (outcome: TurnOutcome) => void;
}) {
  const { running, asked, failed, declined, total, stop, stopped } = progress;
  const only = (outcome: TurnOutcome) => shown.size === 1 && shown.has(outcome);
  const percent = total === 0 ? 0 : Math.round((asked / total) * 100);

  return (
    <div className="shrink-0 border-b border-border bg-muted/30 px-4 py-2.5">
      <div className="flex items-center gap-3">
        <span className="text-xs font-medium text-foreground">
          {running ? 'Running' : stopped ? 'Stopped' : 'Finished'} {asked} of {total}
        </span>
        {declined > 0 && (
          <button
            type="button"
            onClick={() => onShowOnly('declined')}
            aria-pressed={only('declined')}
            title={only('declined') ? 'Show every turn' : 'Show only the declined turns'}
            className={`shrink-0 rounded border px-1.5 py-0.5 text-xs transition-colors ${
              only('declined')
                ? 'border-amber-500/50 bg-amber-500/15 text-amber-200'
                : 'border-transparent text-amber-300 hover:border-amber-500/30 hover:bg-amber-500/10'
            }`}
          >
            {declined} declined
          </button>
        )}
        {failed > 0 && (
          <button
            type="button"
            onClick={() => onShowOnly('failed')}
            aria-pressed={only('failed')}
            title={only('failed') ? 'Show every turn' : 'Show only the failed turns'}
            className={`shrink-0 rounded border px-1.5 py-0.5 text-xs transition-colors ${
              only('failed')
                ? 'border-red-500/50 bg-red-500/15 text-red-200'
                : 'border-transparent text-red-300 hover:border-red-500/30 hover:bg-red-500/10'
            }`}
          >
            {failed} failed
          </button>
        )}
        <div className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-sky-400 transition-[width] duration-200"
            style={{ width: `${percent}%` }}
          />
        </div>
        {running && (
          <button
            type="button"
            onClick={stop}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-red-500/40 px-2 py-1 text-xs text-red-300 transition-colors hover:bg-red-500/10"
          >
            <Square className="h-3 w-3" />
            Stop
          </button>
        )}
      </div>
    </div>
  );
}
