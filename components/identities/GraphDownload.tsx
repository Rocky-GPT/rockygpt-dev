'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Download } from 'lucide-react';
import type { IdentityIndex } from '@/lib/identities';
import { buildCampusGraphExport } from '@/lib/campus-graph-export';

export function GraphDownload({ index }: { index: IdentityIndex }) {
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const objectUrl = useRef<string | null>(null);
  const helpId = useId();

  useEffect(() => () => {
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
  }, []);

  function download() {
    setError(''); setStatus('');
    try {
      const graph = buildCampusGraphExport(index, new Date().toISOString());
      const blob = new Blob([JSON.stringify(graph, null, 2)], { type: 'application/json' });
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const version = index.dataset_version.replace(/[^a-zA-Z0-9._-]/g, '-');
      link.href = objectUrl.current;
      link.download = `rockygpt-campus-graph-${version}-${index.identity_hash.slice(0, 12)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setStatus('Graph JSON download started. Source record contents are referenced, not embedded.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not prepare the graph download.');
    }
  }

  return <div className="max-w-sm space-y-1.5">
    <button type="button" onClick={download} aria-describedby={helpId} title="Download all identities, relationships, source references and unresolved links as JSON" className="flex items-center gap-2 rounded-lg border border-sky-400/30 bg-sky-400/10 px-3 py-2 text-xs text-sky-200 hover:bg-sky-400/20"><Download className="h-3.5 w-3.5" />Download graph</button>
    <p id={helpId} className="text-[10px] leading-4 text-muted-foreground">JSON · all relationships and source references</p>
    {status && <p role="status" className="text-[11px] leading-4 text-green-200">{status}</p>}
    {error && <p role="alert" className="text-[11px] leading-4 text-amber-200">{error}</p>}
  </div>;
}
