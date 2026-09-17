import type { Metadata } from 'next';
import { PromptsDashboard } from '@/components/PromptsDashboard';

export const metadata: Metadata = {
  title: 'Prompts & Models | RockyGPT Dev',
  description: 'The instructions and models behind each stage of turn execution',
};

export default function PromptsPage() {
  return <PromptsDashboard />;
}
