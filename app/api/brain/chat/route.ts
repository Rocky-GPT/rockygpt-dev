import { proxyBrainChat } from '@/lib/brain-proxy';

export function POST(request: Request) {
  return proxyBrainChat(request);
}
