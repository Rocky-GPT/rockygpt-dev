'use client';

import { useCallback, useEffect, useState } from 'react';
import { RecordTable } from '@/components/CapabilityExplorer';

/**
 * Every capability's executor output, one at a time.
 *
 * Distinct from the Capabilities page, which is about the registry and shows
 * records as illustration. Here the records are the subject.
 */
export function RecordsBrowser({ capabilities }: { capabilities: string[] }) {
  const [chosen, setChosen] = useState(capabilities[0] ?? '');
  const [state, setState] = useState<{ returned: number; records: Record<string, unknown>[] } | null>(
    null
  );
  const [failed, setFailed] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!chosen) return;
    setState(null);
    setFailed(null);
    try {
      const response = await fetch(`/api/brain/capabilities/${chosen}/records`, {
        cache: 'no-store',
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body?.error?.message ?? body?.error ?? `HTTP ${response.status}`);
      }
      setState(body);
    } catch (error) {
      setFailed(error instanceof Error ? error.message : 'The lookup did not answer.');
    }
  }, [chosen]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {capabilities.map((capability) => (
          <button
            key={capability}
            type="button"
            onClick={() => setChosen(capability)}
            aria-pressed={capability === chosen}
            className={`rounded-full border px-3 py-1.5 font-mono text-xs transition-colors ${
              capability === chosen
                ? 'border-sky-400/50 bg-sky-400/15 text-sky-200'
                : 'border-white/10 bg-white/5 text-muted-foreground hover:border-white/25 hover:text-foreground'
            }`}
          >
            {capability}
          </button>
        ))}
      </div>
      <RecordTable state={state} failed={failed} />
    </div>
  );
}
