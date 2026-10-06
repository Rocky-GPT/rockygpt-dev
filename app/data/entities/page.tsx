import type { Metadata } from 'next';
import Link from 'next/link';
import { ErrorPanel } from '@/components/ErrorPanel';
import { FactsView } from '@/components/dev/OfficesBrowser';
import { PageHeader } from '@/components/shell/PageHeader';
import { readBrainDev } from '@/lib/brain-proxy';
import { campusGraphHref } from '@/lib/campus-graph-link';
import { readFacts } from '@/lib/office-facts';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Campus Graph | RockyGPT Dev',
  description: 'Explore the root, office nodes and the published evidence used by chat.',
};

interface GraphNode {
  id: string;
  label: string;
  kind: string;
  entity_id?: string;
  aliases?: string[];
}

interface GraphRead {
  node: GraphNode;
  path: GraphNode[];
  children: GraphNode[];
  facts: unknown;
  truncated: boolean;
  dataset_version: string;
  identity_hash: string;
  as_of: string;
  scope: string;
}

export default async function CampusGraphPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supplied = await searchParams;
  const params = new URLSearchParams();
  for (const key of ['node_id', 'dataset_version', 'identity_hash', 'as_of', 'fields']) {
    const value = supplied[key];
    if (typeof value === 'string') params.set(key, value);
  }
  if (!params.has('node_id')) params.set('node_id', 'ramapo');
  const result = await readBrainDev<GraphRead>(`/v1/dev/graph/node?${params}`);
  const graph = result.data;
  const facts = graph?.facts ? readFacts(graph.facts) : null;
  const fields = params.get('fields')?.split(',');
  const href = (nodeId: string) => graph
    ? campusGraphHref(nodeId, graph.dataset_version, graph.identity_hash, graph.as_of, fields)
    : '/data/entities';

  return (
    <>
      <PageHeader title="Campus Graph" subtitle="Ramapo → Offices → office → published records" />
      <main className="min-w-0 space-y-5 px-6 py-6">
        {!graph ? (
          <>
            <ErrorPanel title="Could not open this graph node" detail={result.problem} />
            <Link href="/data/entities" prefetch={false} className="text-sm text-sky-400 underline">
              Open the current root
            </Link>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">{graph.scope}</p>
            <nav aria-label="Graph path">
              <ol className="flex flex-wrap items-center gap-2 text-sm">
                {graph.path.map((node, index) => (
                  <li key={node.id} className="flex items-center gap-2">
                    {index > 0 && <span aria-hidden="true">→</span>}
                    <Link href={href(node.id)} prefetch={false}
                      aria-current={node.id === graph.node.id ? 'page' : undefined}
                      className="rounded-lg border border-border px-3 py-2 text-sky-400 hover:bg-white/5">
                      {node.label}
                    </Link>
                  </li>
                ))}
              </ol>
            </nav>
            <section className="space-y-3 rounded-xl border border-border p-4">
              <h2 className="text-lg font-semibold">{graph.node.label}</h2>
              <p className="break-all font-mono text-xs text-muted-foreground">{graph.node.id}</p>
              {graph.node.aliases && graph.node.aliases.length > 0 && (
                <p className="text-sm text-muted-foreground">Also called: {graph.node.aliases.join(', ')}</p>
              )}
              {graph.children.length > 0 && (
                <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {graph.children.map(node => (
                    <li key={node.id}>
                      <Link href={href(node.id)} prefetch={false}
                        className="block rounded-lg border border-border p-3 text-sm text-sky-400 hover:bg-white/5">
                        <span>{node.label} →</span>
                        <span className="mt-1 block text-xs text-muted-foreground">{node.kind}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              {graph.truncated && <p className="text-sm text-amber-300">The office list is truncated; some nodes are not shown.</p>}
            </section>
            {facts && (
              <section className="space-y-4" aria-label="Published evidence">
                <FactsView facts={facts} aliases={[]} entityId={facts.entity.id} />
              </section>
            )}
            {graph.facts && !facts ? <ErrorPanel title="Could not read the node's evidence" detail="The Brain returned an unreadable facts response." /> : null}
            <div className="space-y-1 break-all font-mono text-xs text-muted-foreground">
              <p>Release: {graph.dataset_version}</p>
              <p>Identity hash: {graph.identity_hash}</p>
              <p>Evidence evaluated at: {graph.as_of}</p>
              {fields?.length ? <p>Fields from the lookup: {fields.join(', ')}</p> : null}
            </div>
          </>
        )}
      </main>
    </>
  );
}
