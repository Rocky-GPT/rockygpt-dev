import type { Metadata } from 'next';
import { AskWorkbench } from '@/components/ask/AskWorkbench';

export const metadata: Metadata = {
  title: 'Ask & Inspect | RockyGPT Dev',
  description: 'Send a message through the current clean-room Brain chat shell.',
};

export default function AskPage() {
  return <AskWorkbench />;
}
