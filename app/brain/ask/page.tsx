import type { Metadata } from 'next';
import { BrainFeaturePending } from '@/components/shell/BrainFeaturePending';
import { PageHeader } from '@/components/shell/PageHeader';

export const metadata: Metadata = {
  title: 'Ask & Inspect | RockyGPT Dev',
  description: 'Preserved while the clean-room chat contract is rebuilt.',
};

export default function AskPage() {
  return (
    <>
      <PageHeader title="Ask & Inspect" subtitle="Waiting on the clean-room Brain" />
      <main className="min-w-0 px-6 py-6">
        <BrainFeaturePending contract="a new chat and trace contract" />
      </main>
    </>
  );
}
