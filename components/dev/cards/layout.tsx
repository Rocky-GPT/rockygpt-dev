import type { ReactNode } from 'react';
import { type CardRead, kindColor, linkGroups } from '@/lib/graph-cards';
import { Links } from '../GraphBrowser';
import { ConnectionsMap } from './ConnectionsMap';
import { Box, type Href } from './parts';

/** What every card gets: the node's read, links to other cards, and the campus clock. */
export interface CardContext {
  read: CardRead;
  href: Href;
  /** The campus day ("2026-11-02"), weekday ("Monday") and minutes after midnight. */
  today: string;
  weekday: string;
  minutes: number;
  /** The same card on another menu day. */
  dayHref: (day: string) => string;
}

/**
 * The frame every type's card shares: its header, its own boxes beside the connections map, then
 * every link both ways and the raw rows, so nothing the graph holds is ever hidden by a design.
 */
export function CardLayout({ ctx, hero, main, side, gaps = [] }: {
  ctx: CardContext;
  hero: ReactNode;
  main: ReactNode;
  side?: ReactNode;
  /** Links this type should have that the graph does not have yet: drawn as dashed bubbles. */
  gaps?: string[];
}) {
  const { read, href } = ctx;
  const groups = linkGroups(read);
  const total = groups.reduce((sum, group) => sum + group.nodes.length + group.missing, 0);
  return (
    <div className="space-y-5">
      {hero}
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_352px]">
        <div className="min-w-0 space-y-5">{main}</div>
        <div className="min-w-0 space-y-5">
          <Box title="Connections" note={`${total} link${total === 1 ? '' : 's'}`}>
            <ConnectionsMap center={read.node.label} color={kindColor(read.node.kind)} gaps={gaps}
              groups={groups.map(group => ({
                key: group.key, label: group.label, color: kindColor(group.kind), missing: group.missing,
                nodes: group.nodes.map(node => ({ id: node.id, label: node.label, href: href(node.id) })),
              }))} />
          </Box>
          {side}
        </div>
      </div>
      <details className="rounded-2xl border border-[#303030] bg-[#1d1d1d] p-4">
        <summary className="cursor-pointer text-sm font-semibold text-zinc-300">Every link and raw record</summary>
        <div className="mt-4 space-y-4">
          <Links title="Links out" links={read.outgoing ?? []} href={href} arrow="this —TYPE→" />
          <Links title="Links in" links={read.incoming ?? []} href={href} arrow="—TYPE→ this" />
          {(read.facts ?? []).map(fact => (
            <section key={fact.collection} className="rounded-xl border border-border p-4" aria-label={`${fact.collection} rows`}>
              <h3 className="mb-2 font-semibold">
                {fact.collection} <span className="text-muted-foreground">({fact.rows.length} shown of {fact.total})</span>
              </h3>
              <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-all font-mono text-xs text-zinc-400">
                {JSON.stringify(fact.rows, null, 2)}
              </pre>
            </section>
          ))}
        </div>
      </details>
    </div>
  );
}
