import type { Metadata } from 'next';
import { AnswerCards } from '@/components/dev/AnswerCards';
import { PageHeader } from '@/components/shell/PageHeader';

export const metadata: Metadata = {
  title: 'Answer Cards | RockyGPT Dev',
  description: 'One card per how-to task, joined from every office page that lists it, with the page whose steps win.',
};

export default function AnswerCardsPage() {
  return (
    <>
      <PageHeader
        title="Answer Cards"
        subtitle="One card per how-to task, joined from every office page that lists it. Look only: no chat reply uses a card yet"
      />
      <main className="min-w-0 px-6 py-6">
        <AnswerCards />
      </main>
    </>
  );
}
