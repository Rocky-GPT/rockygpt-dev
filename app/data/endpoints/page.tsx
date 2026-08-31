import type { Metadata } from 'next';
import { BrainFeaturePending } from '@/components/shell/BrainFeaturePending';
import { PageHeader } from '@/components/shell/PageHeader';

export const metadata: Metadata = {
  title: 'Endpoints | RockyGPT Dev',
  description: 'Preserved while the clean-room data routes are rebuilt.',
};

export default function EndpointsPage() {
  return (
    <>
      <PageHeader title="Endpoints" subtitle="Waiting on the clean-room Brain" />
      <main className="min-w-0 px-6 py-6">
        <BrainFeaturePending contract="new data endpoint contracts" />
      </main>
    </>
  );
}
