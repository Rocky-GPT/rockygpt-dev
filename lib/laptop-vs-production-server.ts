/**
 * Asks one way of the Laptop vs Production page, from the dev server, the way
 * compare-production.py and the 11-02 four-way run did: the sites through /api/chat like a student's
 * browser, the Brains through /v1/chat.
 *
 * The production Brain's address and service token come from 1Password through
 * the workspace's `local-env.py --snapshot dev-production`, read once on the first
 * production-Brain question and kept in this process only. They never reach the page.
 */

import 'server-only';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { brainAddress } from './brain-address';
import { PRODUCTION_AT_ONCE, failedReply, readReply, wayFor, type WayId, type WayResult } from './laptop-vs-production';

const ASK_TIMEOUT_MS = 180_000;
const TOKEN_HEADER = 'x-rockygpt-environment-token';
const USER_AGENT = 'RockyGPT-dev-compare/1.0';
// One tab value for this dev server, so the sites rate-limit it like one browser tab.
const TAB = randomBytes(18).toString('base64url');

function trimmed(value: string | undefined, fallback: string): string {
  return (value?.trim() || fallback).replace(/\/+$/, '');
}

export function siteUrl(way: 'laptop-site' | 'live-site'): string {
  return way === 'laptop-site'
    ? trimmed(process.env.ROCKY_STUDENT_UI, 'http://localhost:3000')
    : trimmed(process.env.ROCKY_PROD_SITE, 'https://rockygpt.danielrajakumar.com');
}

/** The workspace root: ROCKYGPT_WORKSPACE_DIR, else the folder holding rockygpt-dev. */
function workspace(): string {
  return process.env.ROCKYGPT_WORKSPACE_DIR?.trim() || path.resolve(process.cwd(), '..');
}

let production: Promise<{ url: string; token: string }> | null = null;

function readProductionTarget(): Promise<{ url: string; token: string }> {
  const root = workspace();
  const python = path.join(root, 'rockygpt-brain', '.venv', 'bin', 'python');
  const launcher = path.join(root, 'local-env.py');
  return new Promise((resolve, reject) => {
    if (!existsSync(python) || !existsSync(launcher)) {
      reject(new Error('local-env.py or the Brain virtualenv was not found next to rockygpt-dev.'));
      return;
    }
    const child = spawn(python, [launcher, '--snapshot', 'dev-production'], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => (stdout += chunk));
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => (stderr = (stderr + chunk).slice(-2000)));
    child.on('error', (error) => reject(new Error(`Could not start local-env.py: ${error.message}`)));
    child.on('close', (code) => {
      try {
        const values = JSON.parse(stdout) as Record<string, string>;
        const url = values.BRAIN_URL?.trim().replace(/\/+$/, '');
        const token = (values.SERVICE_TOKEN || values.STAGING_SERVICE_TOKEN)?.trim();
        if (url && token) return resolve({ url, token });
      } catch {
        // Reported below without the output, which holds secrets.
      }
      // local-env.py's own errors name no values; its last line says what is missing.
      const reason = stderr.trim().split('\n').pop() || `local-env.py stopped (exit code ${code}).`;
      reject(new Error(`Could not read production's Brain token from 1Password. ${reason}`));
    });
  });
}

function productionTarget() {
  production ??= readProductionTarget().catch((error: unknown) => {
    production = null;
    throw error;
  });
  return production;
}

// The live site and the production Brain both run on production's one small Render
// server; a freed slot passes straight to the next waiting ask.
let productionActive = 0;
const productionWaiting: (() => void)[] = [];

function productionSlot(signal: AbortSignal): Promise<void> {
  if (productionActive < PRODUCTION_AT_ONCE) {
    productionActive += 1;
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const take = () => {
      signal.removeEventListener('abort', leave);
      resolve();
    };
    const leave = () => {
      productionWaiting.splice(productionWaiting.indexOf(take), 1);
      reject(signal.reason);
    };
    productionWaiting.push(take);
    signal.addEventListener('abort', leave, { once: true });
  });
}

function releaseProductionSlot() {
  const next = productionWaiting.shift();
  if (next) next();
  else productionActive -= 1;
}

async function send(way: WayId, question: string, signal: AbortSignal): Promise<WayResult> {
  const messages = [{ role: 'user', content: question }];
  const headers = new Headers({ 'content-type': 'application/json', 'user-agent': USER_AGENT });
  let url: string;
  if (way === 'laptop-site' || way === 'live-site') {
    url = `${siteUrl(way)}/api/chat`;
    // What the student page sends: it reads either a server-sent result or JSON.
    headers.set('accept', 'text/event-stream, application/json');
    headers.set('x-rockygpt-client', TAB);
  } else if (way === 'laptop-brain') {
    const { url: brain } = brainAddress();
    if (!brain) return failedReply(way, 'BRAIN_URL is not set for this dev server.', 0);
    url = `${brain}/v1/chat`;
    headers.set('accept', 'application/json');
  } else {
    const target = await productionTarget();
    url = `${target.url}/v1/chat`;
    headers.set('accept', 'application/json');
    headers.set(TOKEN_HEADER, target.token);
  }

  const started = performance.now();
  const seconds = () => (performance.now() - started) / 1_000;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ messages }),
      cache: 'no-store',
      signal: AbortSignal.any([signal, AbortSignal.timeout(ASK_TIMEOUT_MS)]),
    });
    const text = await response.text();
    return readReply(way, response.status, response.headers.get('content-type') ?? '', text, seconds());
  } catch (error) {
    if (signal.aborted) return failedReply(way, 'Stopped before it answered.', seconds());
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      return failedReply(way, `No answer within ${ASK_TIMEOUT_MS / 1_000} seconds.`, seconds());
    }
    return failedReply(way, `Could not connect to ${new URL(url).host}. Is it running?`, seconds());
  }
}

export async function askWay(way: WayId, question: string, signal: AbortSignal): Promise<WayResult> {
  if (!wayFor(way).production) return send(way, question, signal);
  try {
    await productionSlot(signal);
  } catch {
    return failedReply(way, 'Stopped before it answered.', 0);
  }
  try {
    return await send(way, question, signal);
  } catch (error) {
    return failedReply(way, error instanceof Error ? error.message : 'The ask failed.', 0);
  } finally {
    releaseProductionSlot();
  }
}

/** Where each way asks, for the column headers. The production Brain's address is in 1Password. */
export function wayAddresses(): Record<WayId, string> {
  return {
    'laptop-site': `${siteUrl('laptop-site')}/api/chat`,
    'live-site': `${siteUrl('live-site')}/api/chat`,
    'laptop-brain': `${brainAddress().url ?? 'BRAIN_URL not set'}/v1/chat`,
    'production-brain': 'Render /v1/chat (token from 1Password)',
  };
}
