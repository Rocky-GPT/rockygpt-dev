/** Resolve the clean-room Brain service address. */

const LOCAL_BRAIN_URL = 'http://127.0.0.1:8000';

export interface ServiceAddress {
  url: string | null;
  problem?: string;
}

function trimmed(value: string | undefined): string {
  return (value ?? '').trim().replace(/\/+$/, '');
}

export function brainAddress(): ServiceAddress {
  const configured = trimmed(process.env.BRAIN_URL);
  if (configured) return { url: configured };
  if (process.env.NODE_ENV !== 'production') return { url: LOCAL_BRAIN_URL };
  return { url: null, problem: 'BRAIN_URL is not set in this environment.' };
}
