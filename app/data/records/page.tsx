import type { Metadata } from 'next';
import { BrainFeaturePending } from '@/components/shell/BrainFeaturePending';
import { PageHeader } from '@/components/shell/PageHeader';

export const metadata: Metadata = {
  title: 'Records | RockyGPT Dev',
  description: 'Preserved while the clean-room records contract is rebuilt.',
};

export default function RecordsPage() {
  return (
    <>
      <PageHeader title="Records" subtitle="Waiting on the clean-room Brain" />
      <main className="min-w-0 px-6 py-6">
        <BrainFeaturePending contract="a new records contract" />
      </main>
    </>
  );
}
