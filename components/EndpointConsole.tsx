'use client';

import { useState } from 'react';
import { Play } from 'lucide-react';
import { JsonViewer } from '@/components/JsonViewer';

/**
 * The brain's shaped campus routes, with a request builder.
 *
 * Two of them take a date and refuse a malformed one, which makes this the
 * cheapest way to see the brain's error path without breaking anything.
 */
const ROUTES: ReadonlyArray<{ path: string; param?: 'q' | 'date'; required?: boolean }> = [
  { path: 'directory' },
  { path: 'map', param: 'q' },
  { path: 'shuttle' },
  { path: 'menu' },
  { path: 'menu/browse', param: 'date', required: true },
  { path: 'dining-hours', param: 'date' },
];

export function EndpointConsole() {
  const [chosen, setChosen] = useState(ROUTES[0]);
  const [value, setValue] = useState('');
  const [result, setResult] = useState<{ status: number; body: unknown } | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    setResult(null);
    const query = chosen.param && value ? `?${chosen.param}=${encodeURIComponent(value)}` : '';
    try {
      const response = await fetch(`/api/brain/ui/${chosen.path}${query}`, { cache: 'no-store' });
      const text = await response.text();
      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
      setResult({ status: response.status, body });
    } catch (error) {
      setResult({ status: 0, body: { error: String(error) } });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {ROUTES.map((route) => (
          <button
            key={route.path}
            type="button"
            onClick={() => {
              setChosen(route);
              setValue('');
              setResult(null);
            }}
            aria-pressed={route.path === chosen.path}
            className={`rounded-full border px-3 py-1.5 font-mono text-xs transition-colors ${
              route.path === chosen.path
                ? 'border-sky-400/50 bg-sky-400/15 text-sky-200'
                : 'border-white/10 bg-white/5 text-muted-foreground hover:border-white/25 hover:text-foreground'
            }`}
          >
            /v1/{route.path}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-2 rounded-2xl border border-white/10 bg-white/5 p-4">
        <span className="font-mono text-sm text-foreground/70">/v1/{chosen.path}</span>
        {chosen.param && (
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[11px] text-muted-foreground">
              {chosen.param}
              {chosen.required ? ' (required)' : ''}
            </span>
            <input
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder={chosen.param === 'date' ? 'YYYY-MM-DD' : 'search text'}
              className="w-48 rounded-lg border border-border bg-background px-2 py-1 font-mono text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
            />
          </label>
        )}
        <button
          type="button"
          onClick={run}
          disabled={busy}
          className="flex items-center gap-1.5 rounded-lg bg-sky-500/90 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-sky-400 disabled:opacity-40"
        >
          <Play className="h-3 w-3" />
          {busy ? 'Running…' : 'Send'}
        </button>
      </div>

      {result && (
        <JsonViewer
          data={result.body}
          title={`HTTP ${result.status} · /v1/${chosen.path}`}
          alwaysOpen
          downloadFileName={`rockygpt-${chosen.path.replace('/', '-')}.json`}
        />
      )}
    </div>
  );
}
