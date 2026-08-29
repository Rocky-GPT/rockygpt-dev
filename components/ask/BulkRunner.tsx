'use client';

import { Square } from 'lucide-react';

export interface BulkProgress {
  running: boolean;
  asked: number;
  failed: number;
  total: number;
  stop: () => void;
  stopped?: boolean;
}

export function BulkRunner({ progress }: { progress: BulkProgress }) {
  const { running, asked, failed, total, stop, stopped } = progress;
  const percent = total === 0 ? 0 : Math.round((asked / total) * 100);

  return (
    <div className="shrink-0 border-b border-border bg-muted/30 px-4 py-2.5">
      <div className="flex items-center gap-3">
        <span className="text-xs font-medium text-foreground">
          {running ? 'Running' : stopped ? 'Stopped' : 'Finished'} {asked} of {total}
        </span>
        {failed > 0 && <span className="text-xs text-red-300">{failed} failed</span>}
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
