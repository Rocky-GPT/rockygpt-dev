import type { Metadata } from 'next';
import { BrainFeaturePending } from '@/components/shell/BrainFeaturePending';
import { PageHeader } from '@/components/shell/PageHeader';

export const metadata: Metadata = {
  title: 'Feedback | RockyGPT Dev',
  description: 'Not built for this Brain.',
};

export default function FeedbackPage() {
  return (
    <>
      <PageHeader title="Feedback" subtitle="Not built for this Brain" />
      <main className="min-w-0 px-6 py-6">
        <BrainFeaturePending contract="the GET and POST /v1/feedback routes" />
      </main>
    </>
  );
}
