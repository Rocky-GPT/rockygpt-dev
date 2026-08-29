export type PillTone = 'ok' | 'warn' | 'bad' | 'idle';

const TONES: Record<PillTone, string> = {
  ok: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  // Amber is its own state, not a shade of red. The brain returns HTTP 200
  // while degraded, so "serving but something is broken" has to be visually
  // distinct from both healthy and down.
  warn: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
  bad: 'border-red-500/40 bg-red-500/10 text-red-300',
  idle: 'border-white/10 bg-white/5 text-muted-foreground',
};

export function StatusPill({ tone, children }: { tone: PillTone; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}
