import Link from 'next/link';

/** One node as the Brain's whole-graph reader (`GET /v1/dev/graph/browse`) names it. */
export interface BrowseNode {
  id: string;
  label: string;
  kind: string;
  entity_id?: string;
  aliases?: string[];
  count?: number;
}

export interface BrowseLink {
  type: string;
  node: BrowseNode | null;
  missing_id?: string | null;
  record?: { collection: string; source_key: string; source_record_key: string };
  sources: string[];
}

/** The data build's note on a node with no link in or out. */
export interface UnlinkedNote {
  reason: string | null;
  on_purpose: boolean;
}

export interface UnlinkedNode extends BrowseNode, UnlinkedNote {}

export interface BrowseRead {
  dataset_version: string;
  identity_hash: string;
  node: BrowseNode;
  path: BrowseNode[];
  /** The root's: every node type in the release, and every link type between them. */
  kinds?: BrowseNode[];
  link_types?: Array<{ from: string; type: string; to: string; count: number }>;
  unlinked_targets?: Record<string, number>;
  entity_count?: number;
  /** The root's count of nodes with no link in or out; one node's note when it has none. */
  unlinked?: { total: number; on_purpose: number } | UnlinkedNote | null;
  /** The `unlinked` check's: every node with no link in or out. */
  unlinked_nodes?: UnlinkedNode[];
  /** A node type's: every node of that type. */
  children?: BrowseNode[];
  /** One node's. */
  status?: string | null;
  records?: Array<{ collection: string; source_key: string; count: number }>;
  outgoing?: BrowseLink[];
  incoming?: BrowseLink[];
  evidence_node?: string | null;
}

/** The browse reader's check that lists every node with no link in or out. */
export const UNLINKED_ID = 'unlinked';

const amber = 'rounded-xl border border-dashed border-amber-400/50 bg-amber-400/[0.07]';

function Tag({ onPurpose }: { onPurpose: boolean }) {
  return onPurpose
    ? <span className="inline-block shrink-0 rounded-full border border-zinc-500 px-2 py-0.5 text-xs text-muted-foreground">alone on purpose</span>
    : <span className="inline-block shrink-0 rounded-full border border-amber-400/60 px-2 py-0.5 text-xs text-amber-300">gap</span>;
}

/** The root's way to the nodes no link reaches. It is styled apart from the type tiles because it
 * is a check, not part of the graph. */
function UnlinkedBox({ count, href }: { count: { total: number; on_purpose: number }; href: string }) {
  const gaps = count.total - count.on_purpose;
  return (
    <div className="space-y-1">
      <Link href={href} prefetch={false} className={`block p-4 hover:bg-amber-400/10 ${amber}`}>
        <span className="font-semibold text-amber-300">⚠ Not linked to anything ({count.total}) →</span>
        <span className="mt-1 block text-sm text-amber-100/80">
          These nodes have no link in or out, so you can&apos;t reach them by following links from Ramapo.
          The bot can&apos;t walk to them either. Each one says why.
        </span>
        <span className="mt-2 flex flex-wrap gap-4 text-xs text-amber-100/80">
          <span className="flex items-center gap-2"><Tag onPurpose={false} /> {gaps} still need a page that says where they belong</span>
          <span className="flex items-center gap-2"><Tag onPurpose /> {count.on_purpose} should stay alone</span>
        </span>
      </Link>
      <p className="font-mono text-xs text-muted-foreground">This box is a check, not part of the graph: it has no link of its own.</p>
    </div>
  );
}

function UnlinkedList({ nodes, href }: { nodes: UnlinkedNode[]; href: (nodeId: string) => string }) {
  const byKind = new Map<string, UnlinkedNode[]>();
  for (const node of nodes) byKind.set(node.kind, [...(byKind.get(node.kind) ?? []), node]);
  if (nodes.length === 0) return <p className="text-sm text-muted-foreground">Every node in this release has at least one link.</p>;
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        No link goes in or out of these {nodes.length} nodes. Their facts are in the release, but nothing in the graph
        points to them. The reason comes from the data build.
      </p>
      {[...byKind.entries()].map(([kind, members]) => (
        <section key={kind} aria-label={kind}>
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{kind} ({members.length})</h3>
          <ul className="mt-1 divide-y divide-border border-y border-border">
            {members.map(node => (
              <li key={node.id} className="grid gap-1 py-2 text-sm sm:grid-cols-[minmax(0,2fr)_minmax(0,4fr)_8.5rem] sm:gap-4">
                <Link href={href(node.id)} prefetch={false} className="text-sky-400">{node.label} →</Link>
                <span className={node.reason ? '' : 'text-muted-foreground'}>{node.reason ?? 'No reason recorded by the data build yet.'}</span>
                <span className="sm:justify-self-end"><Tag onPurpose={node.on_purpose} /></span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** The note at the top of a node's card when nothing links to or from it. */
export function UnlinkedBanner({ note, href }: { note: UnlinkedNote; href: string }) {
  return (
    <section className={`space-y-1 p-4 text-sm ${amber}`} aria-label="Not linked to anything">
      <p className="flex flex-wrap items-center gap-2 font-semibold text-amber-300">⚠ Not linked to anything <Tag onPurpose={note.on_purpose} /></p>
      <p className="text-amber-100/80">
        No link goes in or out of this node, so you can&apos;t reach it from Ramapo by following links, and the bot can&apos;t either.
      </p>
      <p className="text-amber-100/80">
        <b className="text-amber-300">Why:</b> {note.reason ?? 'No reason recorded by the data build yet.'}
      </p>
      <Link href={href} prefetch={false} className="inline-block text-sky-400">See every unlinked node →</Link>
    </section>
  );
}

const card = 'block rounded-lg border border-border p-3 text-sm text-sky-400 hover:bg-white/5';

function grouped(links: BrowseLink[]): Array<[string, BrowseLink[]]> {
  const groups = new Map<string, BrowseLink[]>();
  for (const link of links) groups.set(link.type, [...(groups.get(link.type) ?? []), link]);
  return [...groups.entries()];
}

export function Links({ title, links, href, arrow }: {
  title: string;
  links: BrowseLink[];
  href: (nodeId: string) => string;
  arrow: string;
}) {
  return (
    <section className="space-y-3 rounded-xl border border-border p-4" aria-label={title}>
      <h3 className="font-semibold">{title} <span className="text-muted-foreground">({links.length})</span></h3>
      {links.length === 0 ? <p className="text-sm text-muted-foreground">None.</p> : grouped(links).map(([type, members]) => (
        <div key={type} className="space-y-2">
          <p className="font-mono text-xs text-muted-foreground">{arrow.replace('TYPE', type)} ({members.length})</p>
          <ul className="flex flex-wrap gap-2">
            {members.map((link, index) => (
              <li key={`${link.node?.id ?? link.record?.source_record_key ?? link.missing_id}-${index}`}>
                {link.node ? (
                  <Link href={href(link.node.id)} prefetch={false}
                    className="block rounded-lg border border-border px-3 py-1.5 text-sm text-sky-400 hover:bg-white/5">
                    {link.node.label} <span className="text-xs text-muted-foreground">{link.node.kind}</span>
                  </Link>
                ) : (
                  <span className="block rounded-lg border border-dashed border-amber-400/50 px-3 py-1.5 text-sm text-amber-300">
                    {link.record
                      ? `${link.record.collection}: ${link.record.source_record_key} (no node)`
                      : `missing node ${link.missing_id}`}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

/** The whole release graph: every node type, every node, every link both ways. Nothing here is
 * hard-coded to a type, so a type the data adds shows up with no change. */
export function GraphBrowser({ graph, href, filter }: {
  graph: BrowseRead;
  href: (nodeId: string) => string;
  filter?: string;
}) {
  const wanted = filter?.trim().toLowerCase();
  const children = (graph.children ?? []).filter(node => !wanted || node.label.toLowerCase().includes(wanted));
  return (
    <>
      <section className="space-y-3 rounded-xl border border-border p-4">
        <h2 className="text-lg font-semibold">{graph.node.label}</h2>
        <p className="break-all font-mono text-xs text-muted-foreground">{graph.node.id}</p>
        {graph.status && <p className="text-sm text-amber-300">Status: {graph.status}</p>}
        {graph.node.aliases && graph.node.aliases.length > 0 && (
          <p className="text-sm text-muted-foreground">Also called: {graph.node.aliases.join(', ')}</p>
        )}
        {graph.kinds && (
          <>
            <p className="text-sm text-muted-foreground">
              {graph.entity_count?.toLocaleString()} nodes of {graph.kinds.length} types in this release.
            </p>
            <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {graph.kinds.map(kind => (
                <li key={kind.id}>
                  <Link href={href(kind.id)} prefetch={false} className={card}>
                    <span>{kind.label} →</span>
                    <span className="mt-1 block text-xs text-muted-foreground">{kind.count?.toLocaleString()} nodes</span>
                  </Link>
                </li>
              ))}
            </ul>
            {graph.unlinked && 'total' in graph.unlinked && graph.unlinked.total > 0 && (
              <UnlinkedBox count={graph.unlinked} href={href(UNLINKED_ID)} />
            )}
          </>
        )}
        {graph.unlinked_nodes && <UnlinkedList nodes={graph.unlinked_nodes} href={href} />}
        {graph.children && (
          <>
            <form className="flex flex-wrap items-center gap-2 text-sm" action="/data/entities">
              <input type="hidden" name="node_id" value={graph.node.id} />
              <input type="hidden" name="dataset_version" value={graph.dataset_version} />
              <input type="hidden" name="identity_hash" value={graph.identity_hash} />
              <input name="q" defaultValue={filter} placeholder={`Filter ${graph.children.length} nodes by name`}
                className="min-w-0 flex-1 rounded-lg border border-border bg-transparent px-3 py-2" />
              <button type="submit" className="rounded-lg border border-border px-3 py-2 text-sky-400 hover:bg-white/5">Filter</button>
            </form>
            <p className="text-xs text-muted-foreground">Showing {children.length} of {graph.children.length}.</p>
            <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {children.map(node => (
                <li key={node.id}>
                  <Link href={href(node.id)} prefetch={false} className={card}>{node.label} →</Link>
                </li>
              ))}
            </ul>
          </>
        )}
        {graph.evidence_node && (
          <Link href={href(graph.evidence_node)} prefetch={false} className="inline-block text-sm text-sky-400 underline">
            Open the published evidence chat reads for this node
          </Link>
        )}
      </section>
      {graph.link_types && (
        <section className="space-y-2 rounded-xl border border-border p-4" aria-label="Link types">
          <h3 className="font-semibold">Link types</h3>
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr><th className="py-1">From</th><th>Link</th><th>To</th><th className="text-right">Count</th></tr>
            </thead>
            <tbody className="font-mono">
              {graph.link_types.map(link => (
                <tr key={`${link.from}-${link.type}-${link.to}`} className="border-t border-border">
                  <td className="py-1"><Link href={href(`kind:${link.from}`)} prefetch={false} className="text-sky-400">{link.from}</Link></td>
                  <td>{link.type}</td>
                  <td>{link.to === 'missing' ? <span className="text-amber-300">missing</span> : <Link href={href(`kind:${link.to}`)} prefetch={false} className="text-sky-400">{link.to}</Link>}</td>
                  <td className="text-right">{link.count.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {graph.unlinked_targets && Object.keys(graph.unlinked_targets).length > 0 && (
            <p className="text-sm text-amber-300">
              Links to a record with no node: {Object.entries(graph.unlinked_targets).map(([type, n]) => `${type} ${n}`).join(', ')}
            </p>
          )}
        </section>
      )}
      {graph.records && (
        <section className="space-y-2 rounded-xl border border-border p-4 text-sm" aria-label="Source records">
          <h3 className="font-semibold">Source records</h3>
          {graph.records.length === 0 ? <p className="text-muted-foreground">None linked.</p> : (
            <ul className="space-y-1 font-mono text-xs">
              {graph.records.map(record => (
                <li key={`${record.collection}-${record.source_key}`}>{record.collection} · {record.source_key} · {record.count}</li>
              ))}
            </ul>
          )}
        </section>
      )}
      {graph.outgoing && <Links title="Links out" links={graph.outgoing} href={href} arrow="this —TYPE→" />}
      {graph.incoming && <Links title="Links in" links={graph.incoming} href={href} arrow="—TYPE→ this" />}
    </>
  );
}
