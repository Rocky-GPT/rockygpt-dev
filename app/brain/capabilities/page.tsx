import type { Metadata } from 'next';
import { BrainFeaturePending } from '@/components/shell/BrainFeaturePending';
import { PageHeader } from '@/components/shell/PageHeader';

export const metadata: Metadata = {
  title: 'Capabilities | RockyGPT Dev',
  description: 'Preserved while the clean-room capability contract is rebuilt.',
};

export default function CapabilitiesPage() {
  return (
    <>
      <PageHeader title="Capabilities" subtitle="Waiting on the clean-room Brain" />
      <main className="min-w-0 px-6 py-6">
        <BrainFeaturePending contract="a new capabilities contract" />
      </main>
    </>
  );
}
