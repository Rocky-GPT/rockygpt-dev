/**
 * @module lib/brain-address
 * Where the brain lives.
 *
 * This app is a client. It holds no campus data and talks to no database —
 * every fact it shows arrives over HTTP from the brain, which is the whole
 * point of it being a separate interface rather than a separate architecture.
 *
 * The `url === null` case is not an oversight. An unset address and a service
 * that is down are different problems with different fixes — a deploy versus a
 * restart — and reporting both as "the brain is failing" is what once let a
 * missing variable look like an outage for an afternoon. `problem` names the
 * one a deploy fixes, and the operations page reports them apart.
 */

const LOCAL_BRAIN_URL = 'http://127.0.0.1:8000';

/** How long a proxied call may run before it is abandoned. */
const DEFAULT_TIMEOUT_MS = 120_000;

export interface ServiceAddress {
  /** The address, or null when production has not been given one. */
  url: string | null;
  /** Why there is no address, for the operations page to report. */
  problem?: string;
}

function trimmed(value: string | undefined): string {
  return (value ?? '').trim().replace(/\/+$/, '');
}

/**
 * Whether an unset address may fall back to a local one. In development it may:
 * nothing is deployed and loopback is where the brain is. In production it may
 * not, because a silent fallback to an address that does not exist inside the
 * deployment produces an outage that looks like a broken service.
 */
function mayFallBack(): boolean {
  return process.env.NODE_ENV !== 'production';
}

export function brainAddress(): ServiceAddress {
  const configured = trimmed(process.env.BRAIN_URL);
  if (configured) return { url: configured };
  if (mayFallBack()) return { url: LOCAL_BRAIN_URL };
  return { url: null, problem: 'BRAIN_URL is not set in this environment.' };
}

/**
 * The proxy timeout.
 *
 * Configurable because 60s — the student UI's hardcoded value — is not always
 * enough: a chat turn runs three sequential model round-trips, and a cold brain
 * can exceed it. A premature abort there does not look like a slow answer, it
 * looks like a failed one, which is the wrong conclusion to hand someone
 * halfway through a bulk run.
 *
 * Never applied to the log stream. See `lib/brain-proxy`.
 */
export function brainTimeoutMs(): number {
  const configured = Number(process.env.BRAIN_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_TIMEOUT_MS;
}

/** Whether this app was given an admin token. Never returns the value itself. */
export function hasAdminToken(): boolean {
  return Boolean(process.env.ADMIN_API_TOKEN?.trim());
}
