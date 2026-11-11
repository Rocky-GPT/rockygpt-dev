import type { Metadata } from 'next';
import { AnswerCards } from '@/components/dev/AnswerCards';
import { PageHeader } from '@/components/shell/PageHeader';

export const metadata: Metadata = {
  title: 'Answer Cards | RockyGPT Dev',
  description: 'Every how-to task the night job found on the office pages, with the page words behind each step.',
};

export default function AnswerCardsPage() {
  return (
    <>
      <PageHeader
        title="Answer Cards"
        subtitle="Every how-to task the night job found on the office pages. Look only: joining them into cards comes next"
      />
      <main className="min-w-0 px-6 py-6">
        <AnswerCards />
      </main>
    </>
  );
}
