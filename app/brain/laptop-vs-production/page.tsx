import type { Metadata } from 'next';
import { LaptopVsProduction } from '@/components/dev/LaptopVsProduction';
import { PageHeader } from '@/components/shell/PageHeader';

export const metadata: Metadata = {
  title: 'Laptop vs Production | RockyGPT Dev',
  description: 'Ask the laptop Brain and the production Brain the same question, side by side.',
};

export default function LaptopVsProductionPage() {
  return (
    <>
      <PageHeader
        title="Laptop vs Production"
        subtitle="The same question to the laptop Brain and the production Brain, side by side"
      />
      <main className="min-w-0 px-6 py-6">
        <LaptopVsProduction />
      </main>
    </>
  );
}
