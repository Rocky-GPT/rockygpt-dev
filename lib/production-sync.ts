/**
 * The "Sync from production" button's state: the steps that
 * `pull-production-graph.py --events` reports, one JSON line each, folded into
 * what the Release page shows while the laptop's copy of production's data is
 * replaced.
 */

export type SyncStepName = 'checking' | 'found' | 'downloading' | 'installing' | 'done' | 'error';

export interface SyncEvent {
  step: SyncStepName;
  shared?: string;
  total?: number | null;
  received?: number;
  message?: string;
  release?: string | null;
}

export interface SyncState {
  phase: 'idle' | 'running' | 'done' | 'error';
  /** The step now running (or the last one reached). */
  step: SyncStepName | null;
  shared: string | null;
  total: number | null;
  received: number;
  message: string | null;
  release: string | null;
}

export const IDLE_SYNC: SyncState = {
  phase: 'idle',
  step: null,
  shared: null,
  total: null,
  received: 0,
  message: null,
  release: null,
};

export const SYNC_STEPS: { step: SyncStepName; label: string }[] = [
  { step: 'checking', label: 'Find production’s latest data on GitHub' },
  { step: 'downloading', label: 'Download the release graph and meaning index' },
  { step: 'installing', label: 'Replace the laptop’s copy' },
  { step: 'done', label: 'The local Brain serves it' },
];

const ORDER: SyncStepName[] = ['checking', 'found', 'downloading', 'installing', 'done'];

/** Reads one line the script printed; anything that is not a step event is ignored. */
export function parseSyncLine(line: string): SyncEvent | null {
  const text = line.trim();
  if (!text.startsWith('{')) return null;
  try {
    const value = JSON.parse(text) as Partial<SyncEvent>;
    if (typeof value.step !== 'string') return null;
    if (![...ORDER, 'error'].includes(value.step as SyncStepName)) return null;
    return value as SyncEvent;
  } catch {
    return null;
  }
}

export function applySyncEvent(state: SyncState, event: SyncEvent): SyncState {
  switch (event.step) {
    case 'checking':
      return { ...IDLE_SYNC, phase: 'running', step: 'checking' };
    case 'found':
      return {
        ...state,
        phase: 'running',
        step: 'found',
        shared: event.shared ?? null,
        total: typeof event.total === 'number' ? event.total : null,
      };
    case 'downloading':
      return {
        ...state,
        phase: 'running',
        step: 'downloading',
        received: typeof event.received === 'number' ? event.received : state.received,
        total: typeof event.total === 'number' ? event.total : state.total,
      };
    case 'installing':
      return { ...state, phase: 'running', step: 'installing' };
    case 'done':
      return {
        ...state,
        phase: 'done',
        step: 'done',
        message: event.message ?? null,
        release: event.release ?? null,
      };
    case 'error':
      return { ...state, phase: 'error', message: event.message ?? 'The sync failed.' };
  }
}

/** Where the run is, on the listed steps: "found" sits between finding and downloading. */
const POSITION: Record<SyncStepName, number> = {
  checking: 0,
  found: 0.5,
  downloading: 1,
  installing: 2,
  done: 3,
  error: 0,
};

/** Where a listed step stands: finished, running now, failed, or not reached. */
export function stepStatus(state: SyncState, step: SyncStepName): 'done' | 'active' | 'failed' | 'waiting' {
  if (state.step === null) return 'waiting';
  if (state.phase === 'done') return 'done';
  const now = POSITION[state.step];
  const here = POSITION[step];
  if (here < now) return 'done';
  if (here === now) return state.phase === 'error' ? 'failed' : 'active';
  if (state.phase === 'error' && state.step === 'found' && step === 'downloading') return 'failed';
  return 'waiting';
}

export function formatBytes(bytes: number | null | undefined): string {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function downloadPercent(state: SyncState): number | null {
  if (!state.total || state.total <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((state.received / state.total) * 100)));
}
