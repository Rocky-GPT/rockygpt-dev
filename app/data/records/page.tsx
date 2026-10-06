import type { Metadata } from 'next';
import { BrainFeaturePending } from '@/components/shell/BrainFeaturePending';
import { PageHeader } from '@/components/shell/PageHeader';

export const metadata: Metadata = {
  title: 'Records | RockyGPT Dev',
  description: 'Not built for this Brain.',
};

export default function RecordsPage() {
  return (
    <>
      <PageHeader title="Records" subtitle="Not built for this Brain" />
      <main className="min-w-0 px-6 py-6">
        <BrainFeaturePending contract="a GET /v1/capabilities/{name}/records route" />
      </main>
    </>
  );
}
