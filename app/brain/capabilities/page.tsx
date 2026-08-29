import type { Metadata } from 'next';
import { CapabilityExplorer, type Capability } from '@/components/CapabilityExplorer';
import { ErrorPanel } from '@/components/ErrorPanel';
import { PageHeader } from '@/components/shell/PageHeader';
import { readBrain } from '@/lib/brain-proxy';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Capabilities | RockyGPT Dev',
  description: 'What the planner is shown it can look up, exactly as it is shown it.',
};

export default async function CapabilitiesPage() {
  const { data, problem } = await readBrain<{ capabilities: Capability[] }>('/v1/capabilities');
  const capabilities = data?.capabilities;

  return (
    <>
      <PageHeader
        title="Capabilities"
        subtitle={
          capabilities
            ? `${capabilities.length} lookups the planner can choose from — each has code behind it`
            : 'The registry could not be read'
        }
      />
      <main className="min-w-0 px-6 py-6">
        {capabilities ? (
          <CapabilityExplorer capabilities={capabilities} />
        ) : (
          <ErrorPanel title="The capability registry could not be read." detail={problem} />
        )}
      </main>
    </>
  );
}
