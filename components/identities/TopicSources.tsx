'use client';

import type { GraphScope } from '@/lib/campus-graph';
import type { TopicSources as TopicSourceList } from '@/lib/campus-topics';

export function TopicSources({ sources, ownerName, onOpen }: { sources: TopicSourceList; ownerName: string; onOpen: (scope: GraphScope) => void }) {
  return <details className="rounded-xl border border-white/10 bg-black/10 px-4 py-3 text-xs" aria-label={`Sources for ${ownerName}`}>
    <summary className="cursor-pointer text-sky-200">View source</summary>
    <div className="mt-3 space-y-3">
      {sources.collections.length > 0 && <div>
        <p className="mb-2 text-[11px] text-muted-foreground">Original records, including entries without identity links</p>
        <div className="flex flex-wrap gap-2">{sources.collections.map(source => <button key={source.id} type="button" onClick={() => onOpen({ collection: source.id, ownerName })} className="rounded-lg border border-white/15 px-3 py-2 text-left text-neutral-200 hover:bg-white/5">{source.label}</button>)}</div>
      </div>}
      {sources.artifacts.length > 0 && <div>
        <p className="mb-2 text-[11px] text-muted-foreground">Published source files</p>
        <div className="flex flex-wrap gap-2">{sources.artifacts.map(source => <button key={source.id} type="button" onClick={() => onOpen({ collection: 'artifacts', recordId: `artifacts:${source.id}`, label: source.label, ownerName })} className="rounded-lg border border-white/15 px-3 py-2 text-left text-neutral-200 hover:bg-white/5">{source.label}</button>)}</div>
      </div>}
    </div>
  </details>;
}
