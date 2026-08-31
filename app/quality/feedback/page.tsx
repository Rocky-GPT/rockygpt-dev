import type { Metadata } from 'next';
import { BrainFeaturePending } from '@/components/shell/BrainFeaturePending';
import { PageHeader } from '@/components/shell/PageHeader';

export const metadata: Metadata = {
  title: 'Feedback | RockyGPT Dev',
  description: 'Preserved while the clean-room feedback contract is rebuilt.',
};

export default function FeedbackPage() {
  return (
    <>
      <PageHeader title="Feedback" subtitle="Waiting on the clean-room Brain" />
      <main className="min-w-0 px-6 py-6">
        <BrainFeaturePending contract="a new feedback contract" />
      </main>
    </>
  );
}
