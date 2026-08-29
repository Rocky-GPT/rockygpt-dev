import type { Metadata } from 'next';
import { AskWorkbench } from '@/components/ask/AskWorkbench';

export const metadata: Metadata = {
  title: 'Ask & Inspect | RockyGPT Dev',
  description: 'Send a question to the brain and read every stage of the turn it produced.',
};

export default function AskPage() {
  return <AskWorkbench />;
}
