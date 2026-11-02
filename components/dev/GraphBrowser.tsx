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
  /** A node type's: every node of that type. */
  children?: BrowseNode[];
  /** One node's. */
  status?: string | null;
  records?: Array<{ collection: string; source_key: string; count: number }>;
  /** The rows behind those records (a person's contact and profile, a course's catalog row). */
  facts?: Array<{ collection: string; total: number; rows: Array<Record<string, unknown>> }>;
  outgoing?: BrowseLink[];
  incoming?: BrowseLink[];
  evidence_node?: string | null;
}

const card = 'block rounded-lg border border-border p-3 text-sm text-sky-400 hover:bg-white/5';

function grouped(links: BrowseLink[]): Array<[string, BrowseLink[]]> {
  const groups = new Map<string, BrowseLink[]>();
  for (const link of links) groups.set(link.type, [...(groups.get(link.type) ?? []), link]);
  return [...groups.entries()];
}

function Links({ title, links, href, arrow }: {
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

const label = (key: string) => key.replace(/_/g, ' ');

function Value({ value }: { value: unknown }) {
  if (typeof value === 'string') {
    if (/^https:\/\//.test(value)) return <a href={value} target="_blank" rel="noreferrer" className="break-all text-sky-400 underline">{value}</a>;
    if (value.length > 280) {
      return <details><summary className="cursor-pointer">{value.slice(0, 200)}…</summary><p className="whitespace-pre-wrap">{value}</p></details>;
    }
    return <span className="whitespace-pre-wrap">{value}</span>;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return <span>{String(value)}</span>;
  if (Array.isArray(value) && value.every(item => typeof item !== 'object' || item === null)) return <span>{value.join(', ')}</span>;
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return (
      <dl className="grid grid-cols-[minmax(6rem,auto)_1fr] gap-x-3 gap-y-1">
        {Object.entries(value).filter(([, v]) => v !== null && v !== '').map(([key, v]) => (
          <div key={key} className="contents"><dt className="text-muted-foreground">{label(key)}</dt><dd className="min-w-0"><Value value={v} /></dd></div>
        ))}
      </dl>
    );
  }
  return <span className="break-all font-mono text-xs">{JSON.stringify(value)}</span>;
}

/** Everything the node's own source records say, one block per record. */
function Facts({ facts }: { facts: NonNullable<BrowseRead['facts']> }) {
  return (
    <section className="space-y-3 rounded-xl border border-border p-4 text-sm" aria-label="Facts">
      <h3 className="font-semibold">Facts</h3>
      {facts.length === 0 ? <p className="text-muted-foreground">No readable records are linked.</p> : facts.map(group => (
        <div key={group.collection} className="space-y-2">
          <p className="font-mono text-xs text-muted-foreground">
            {group.collection} ({group.rows.length < group.total ? `showing ${group.rows.length} of ${group.total}` : group.total})
          </p>
          {group.rows.map((row, index) => (
            <div key={index} className="rounded-lg border border-border p-3"><Value value={row} /></div>
          ))}
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
          </>
        )}
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
      {graph.facts && <Facts facts={graph.facts} />}
      {graph.outgoing && <Links title="Links out" links={graph.outgoing} href={href} arrow="this —TYPE→" />}
      {graph.incoming && <Links title="Links in" links={graph.incoming} href={href} arrow="—TYPE→ this" />}
    </>
  );
}
