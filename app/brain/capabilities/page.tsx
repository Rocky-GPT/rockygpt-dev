import type { Metadata } from 'next';
import { PageHeader } from '@/components/shell/PageHeader';
import { CapabilityExplorer, Capability } from '@/components/CapabilityExplorer';
import { brainAddress } from '@/lib/brain-address';

export const metadata: Metadata = {
  title: 'Capabilities | RockyGPT Dev',
  description: 'What the planner is shown it can look up and the records behind it',
};

async function getCapabilities(): Promise<Capability[]> {
  const { url } = brainAddress();
  if (!url) return [];
  try {
    const res = await fetch(`${url}/v1/capabilities`, { cache: 'no-store' });
    if (!res.ok) return [];
    const data = await res.json();
    return data.capabilities || [];
  } catch {
    return [];
  }
}

export default async function CapabilitiesPage() {
  const capabilities = await getCapabilities();

  return (
    <>
      <PageHeader
        title="Capabilities"
        subtitle="The lookup tools and campus evidence collections available to RockyGPT"
      />
      <main className="min-w-0 px-6 py-6">
        <CapabilityExplorer capabilities={capabilities} />
      </main>
    </>
  );
}
