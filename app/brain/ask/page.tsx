import type { Metadata } from 'next';
import { AskWorkbench } from '@/components/ask/AskWorkbench';

export const metadata: Metadata = {
  title: 'Ask & Inspect | RockyGPT Dev',
  description: 'Inspect student conversations, answers, sources, and tool calls.',
};

export default function AskPage() {
  return <AskWorkbench />;
}
