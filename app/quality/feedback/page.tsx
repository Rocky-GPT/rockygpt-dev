import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/shell/PageHeader';

export const metadata: Metadata = {
  title: 'Feedback | RockyGPT Dev',
  description: 'Where student and operator feedback currently lives.',
};

export default function FeedbackPage() {
  return (
    <>
      <PageHeader title="Feedback" subtitle="Partial — it rides inside the log rows" />
      <main className="min-w-0 px-6 py-6">
        <div className="max-w-3xl space-y-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 text-sm leading-6 text-amber-100">
          <p>
            There is no feedback endpoint to aggregate. Both kinds ride on the
            chat-log rows instead, and they are different things worth keeping
            apart:
          </p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <strong>Student feedback</strong> — the thumbs on the answer,
              joined onto a log row as{' '}
              <code className="font-mono">feedback_rating</code>,{' '}
              <code className="font-mono">feedback_category</code>, and{' '}
              <code className="font-mono">feedback_comment</code>.
            </li>
            <li>
              <strong>Operator feedback</strong> — the thumbs you set while
              reading, stored as <code className="font-mono">feedback</code>.
            </li>
          </ul>
          <p>
            Both are visible and editable on{' '}
            <Link href="/quality/logs" className="font-semibold underline">
              Chat Logs
            </Link>
            . A real section here needs a brain endpoint that groups them.
          </p>
        </div>
      </main>
    </>
  );
}
