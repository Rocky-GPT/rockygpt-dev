import type { Metadata } from 'next';
import { RepeatTest } from '@/components/dev/RepeatTest';
import { PageHeader } from '@/components/shell/PageHeader';

export const metadata: Metadata = {
  title: 'Repeat Test | RockyGPT Dev',
  description: 'Ask every question several times at once and see if the bot gives the same answer each time.',
};

export default function RepeatTestPage() {
  return (
    <>
      <PageHeader
        title="Repeat Test"
        subtitle="Ask every question several times at once and see if the bot gives the same answer each time"
      />
      <main className="min-w-0 px-6 py-6">
        <RepeatTest />
      </main>
    </>
  );
}
