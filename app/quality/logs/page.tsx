import type { Metadata } from 'next';
import { LogsDashboard } from '@/components/LogsDashboard';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Chat Logs | RockyGPT Dev',
  description: 'Live student chat logs, invoked tools, and latency telemetry.',
};

/**
 * No `NODE_ENV` guard.
 *
 * The student app called `notFound()` here outside development, which was the
 * wrong boundary twice over: it 404'd on any built instance, and it conflated
 * "not deployed" with "not authorised". Being a separate, undeployed app is the
 * boundary now; `proxy.ts` is what enforces it.
 */
export default function LogsPage() {
  return <LogsDashboard />;
}
