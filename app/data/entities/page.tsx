import type { Metadata } from 'next';
import { BrainFeaturePending } from '@/components/shell/BrainFeaturePending';
import { PageHeader } from '@/components/shell/PageHeader';

export const metadata: Metadata = {
  title: 'Campus Graph | RockyGPT Dev',
  description: 'Not built for this Brain.',
};

export default function CampusGraphPage() {
  return (
    <>
      <PageHeader title="Campus Graph" subtitle="Not built for this Brain" />
      <main className="min-w-0 px-6 py-6">
        <BrainFeaturePending contract="the GET /v1/dev/graph routes" />
      </main>
    </>
  );
}
