/** Resolve the Brain service address. */

const LOCAL_BRAIN_URL = 'http://127.0.0.1:8000';
const PRODUCTION_BRAIN_URL = 'https://rockygpt-brain.onrender.com';

export interface ServiceAddress {
  url: string | null;
  problem?: string;
  /** The setting that chooses this address, named in connection errors. */
  setting?: string;
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

/**
 * The public production Brain. This app reads only its storage summary, the one
 * production route that exists for it: sizes and counts, never content.
 */
export function productionBrainAddress(): ServiceAddress {
  return {
    url: trimmed(process.env.PRODUCTION_BRAIN_URL) || PRODUCTION_BRAIN_URL,
    setting: 'PRODUCTION_BRAIN_URL',
  };
}
