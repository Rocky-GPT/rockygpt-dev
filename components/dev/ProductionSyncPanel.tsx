'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Check, Circle, Download, Loader2 } from 'lucide-react';
import {
  IDLE_SYNC,
  SYNC_STEPS,
  applySyncEvent,
  downloadPercent,
  formatBytes,
  parseSyncLine,
  stepStatus,
  type SyncState,
} from '@/lib/production-sync';

interface LocalCopy {
  available: boolean;
  running: boolean;
  release: string | null;
  shared: string | null;
}

function when(iso: string | null): string {
  if (!iso) return 'unknown time';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

/**
 * Replaces the laptop's copy of production's campus data on request, showing
 * each step as it happens. Nothing syncs on its own.
 */
export function ProductionSyncPanel() {
  const [copy, setCopy] = useState<LocalCopy | null>(null);
  const [sync, setSync] = useState<SyncState>(IDLE_SYNC);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/local/production-sync', { cache: 'no-store' });
      setCopy((await response.json()) as LocalCopy);
    } catch {
      setCopy(null);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const start = async () => {
    setSync(applySyncEvent(IDLE_SYNC, { step: 'checking' }));
    let state = applySyncEvent(IDLE_SYNC, { step: 'checking' });
    try {
      const response = await fetch('/api/local/production-sync', { method: 'POST' });
      if (!response.body) throw new Error('No response from the dev server.');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let pending = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        pending += decoder.decode(value, { stream: true });
        const lines = pending.split('\n');
        pending = lines.pop() ?? '';
        for (const text of lines) {
          const event = parseSyncLine(text);
          if (event) {
            state = applySyncEvent(state, event);
            setSync(state);
          }
        }
      }
      const last = parseSyncLine(pending);
      if (last) state = applySyncEvent(state, last);
      if (state.phase === 'running') {
        state = applySyncEvent(state, { step: 'error', message: 'The sync ended without a result.' });
      }
      setSync(state);
    } catch (error) {
      setSync(
        applySyncEvent(state, {
          step: 'error',
          message: error instanceof Error ? error.message : 'The sync failed.',
        })
      );
    }
    void refresh();
  };

  const busy = sync.phase === 'running' || copy?.running === true;
  const percent = downloadPercent(sync);

  return (
    <section className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-semibold text-foreground">Laptop copy of production&rsquo;s data</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {copy?.release ? (
              <>
                Serving <span className="font-mono text-foreground">{copy.release}</span>, shared by
                production {when(copy.shared)}.
              </>
            ) : copy ? (
              'No local copy yet. Sync once before starting the local Brain.'
            ) : (
              'Reading the local copy…'
            )}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Changes only when you press the button. It downloads from GitHub, not the production
            database, so it uses none of Neon&rsquo;s transfer.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void start()}
          disabled={busy || copy?.available === false}
          className="flex shrink-0 items-center gap-2 rounded-lg border border-sky-400/40 bg-sky-500/15 px-3 py-2 text-sm font-medium text-sky-100 transition-colors hover:bg-sky-500/25 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {busy ? 'Syncing…' : 'Sync from production'}
        </button>
      </div>

      {copy?.available === false && (
        <p className="text-sm text-amber-200">
          pull-production-graph.py was not found next to rockygpt-dev, so this dev server cannot sync.
        </p>
      )}

      {sync.phase !== 'idle' && (
        <ol className="space-y-2 text-sm">
          {SYNC_STEPS.map(({ step, label }) => {
            const status = stepStatus(sync, step);
            return (
              <li key={step} className="flex items-start gap-2">
                <span className="mt-0.5">
                  {status === 'done' && <Check className="h-4 w-4 text-emerald-400" />}
                  {status === 'active' && <Loader2 className="h-4 w-4 animate-spin text-sky-300" />}
                  {status === 'failed' && <AlertTriangle className="h-4 w-4 text-red-400" />}
                  {status === 'waiting' && <Circle className="h-4 w-4 text-muted-foreground/50" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={status === 'waiting' ? 'text-muted-foreground' : 'text-foreground'}>
                    {label}
                    {step === 'checking' && sync.shared && (
                      <span className="text-muted-foreground">
                        {' '}
                        · shared {when(sync.shared)}, {formatBytes(sync.total)}
                      </span>
                    )}
                    {step === 'done' && sync.phase === 'done' && sync.release && (
                      <span className="text-muted-foreground">
                        {' '}
                        · <span className="font-mono">{sync.release}</span>
                      </span>
                    )}
                  </p>
                  {step === 'downloading' && (status === 'active' || status === 'done') && (
                    <div className="mt-1.5 space-y-1">
                      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full rounded-full bg-sky-400 transition-[width] duration-300"
                          style={{ width: `${status === 'done' ? 100 : (percent ?? 0)}%` }}
                        />
                      </div>
                      <p className="text-xs tabular-nums text-muted-foreground">
                        {formatBytes(sync.received)} of {formatBytes(sync.total)}
                        {percent !== null && status === 'active' ? ` (${percent}%)` : ''}
                      </p>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {sync.phase === 'error' && (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-100">
          {sync.message} The laptop&rsquo;s copy was left as it was.
        </p>
      )}
      {sync.phase === 'done' && sync.message && (
        <p className="text-sm text-emerald-200">Done: {sync.message}.</p>
      )}
    </section>
  );
}
