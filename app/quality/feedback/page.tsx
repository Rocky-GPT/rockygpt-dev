import type { Metadata } from 'next';
import { FeedbackDashboard } from '@/components/FeedbackDashboard';

export const metadata: Metadata = {
  title: 'Feedback | RockyGPT Dev',
  description: 'Real-time student ratings and operator reviews stored in PostgreSQL.',
};

export default function FeedbackPage() {
  return <FeedbackDashboard />;
}
