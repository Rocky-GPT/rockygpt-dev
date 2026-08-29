'use client';

import { useCallback, useEffect, useState } from 'react';
import { JsonViewer } from '@/components/JsonViewer';

/**
 * The metadata strip is the reason this page exists rather than a curl.
 *
 * `X-RockyGPT-Release` and `X-RockyGPT-Data-Source` say which published dataset
 * an answer came from and where it was read — the two facts that decide whether
 * a wrong answer is a stale release or a live bug, and neither is visible
 * anywhere in the student app.
 */
interface Loaded {
  payload: unknown;
  release?: string;
  source?: string;
  etag?: string;
  lastModified?: string;
  bytes: number;
}

export function ArtifactBrowser({ artifacts }: { artifacts: readonly string[] }) {
  const [chosen, setChosen] = useState(artifacts[0]);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoaded(null);
    setFailed(null);
    try {
      const response = await fetch(`/api/brain/data/${chosen}`, { cache: 'no-store' });
      const text = await response.text();
      if (!response.ok) throw new Error(`HTTP ${response.status} — ${text.slice(0, 200)}`);
      setLoaded({
        payload: JSON.parse(text),
        release: response.headers.get('x-rockygpt-release') ?? undefined,
        source: response.headers.get('x-rockygpt-data-source') ?? undefined,
        etag: response.headers.get('etag') ?? undefined,
        lastModified: response.headers.get('last-modified') ?? undefined,
        bytes: new Blob([text]).size,
      });
    } catch (error) {
      setFailed(error instanceof Error ? error.message : 'The artifact did not load.');
    }
  }, [chosen]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {artifacts.map((artifact) => (
          <button
            key={artifact}
            type="button"
            onClick={() => setChosen(artifact)}
            aria-pressed={artifact === chosen}
            className={`rounded-full border px-3 py-1.5 font-mono text-xs transition-colors ${
              artifact === chosen
                ? 'border-sky-400/50 bg-sky-400/15 text-sky-200'
                : 'border-white/10 bg-white/5 text-muted-foreground hover:border-white/25 hover:text-foreground'
            }`}
          >
            {artifact}
          </button>
        ))}
      </div>

      {failed && (
        <p className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 font-mono text-sm text-red-200">
          {failed}
        </p>
      )}

      {loaded && (
        <>
          <dl className="grid grid-cols-2 gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-xs sm:grid-cols-5">
            <Meta label="release" value={loaded.release} />
            <Meta label="source" value={loaded.source} />
            <Meta label="etag" value={loaded.etag} />
            <Meta label="last-modified" value={loaded.lastModified} />
            <Meta label="size" value={`${(loaded.bytes / 1024).toFixed(1)} KB`} />
          </dl>

          <JsonViewer
            data={loaded.payload}
            title={chosen}
            alwaysOpen
            downloadFileName={`rockygpt-${chosen}.json`}
          />
        </>
      )}

      {!loaded && !failed && <p className="text-sm text-muted-foreground">Loading…</p>}
    </div>
  );
}

function Meta({ label, value }: { label: string; value?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="truncate font-mono text-foreground/80" title={value}>
        {value ?? '—'}
      </dd>
    </div>
  );
}
