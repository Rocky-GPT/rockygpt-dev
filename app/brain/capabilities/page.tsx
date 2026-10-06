import type { Metadata } from 'next';
import { ErrorPanel } from '@/components/ErrorPanel';
import { PageHeader } from '@/components/shell/PageHeader';
import { ToolsView } from '@/components/dev/ToolsView';
import { readBrainDev } from '@/lib/brain-proxy';
import type { DevRuntime } from '@/lib/brain-dev-types';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Capabilities | RockyGPT Dev',
  description: 'The tools and answer parts the model is given.',
};

export default async function CapabilitiesPage() {
  const { data, problem } = await readBrainDev<DevRuntime>('/v1/dev/runtime');

  return (
    <>
      <PageHeader
        title="Capabilities"
        subtitle="What the model can do: the tools and answer parts it is given"
      />
      <main className="min-w-0 space-y-8 px-6 py-6">
        {!data ? (
          <ErrorPanel title="Could not read the model's tools" detail={problem} />
        ) : (
          <>
            <section className="space-y-4">
              <div>
                <h2 className="text-sm font-semibold text-foreground">
                  {data.tools.length} {data.tools.length === 1 ? 'tool' : 'tools'}
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {data.tools.length === 1 ? 'This is' : 'These are'} all the model can call. It has
                  nothing else.
                </p>
              </div>
              <ToolsView tools={data.tools} />
            </section>

            <section className="space-y-4">
              <h2 className="text-sm font-semibold text-foreground">
                Answer parts the model can finish with
              </h2>
              <ul className="grid gap-3 md:grid-cols-2">
                {data.parts.map((part) => (
                  <li
                    key={part.kind}
                    className="rounded-2xl border border-white/10 bg-white/5 p-4"
                  >
                    <p className="font-mono text-sm text-foreground">{part.kind}</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{part.note}</p>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </main>
    </>
  );
}
