/**
 * Replaces the laptop's copy of production's campus data, by hand.
 *
 * GET  says which release the local copy holds.
 * POST runs the workspace's `pull-production-graph.py DIR --force --events` and
 *      streams its step events (one JSON line each) as they happen.
 *
 * The copy comes from the daily data run's GitHub artifact, never from the
 * production database. The local Brain serves `.local-logs/production-graph`
 * and switches to the new release by itself once `active.json` is replaced.
 * Like every page here, this only runs on the laptop (proxy.ts refuses
 * deployments).
 */

import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** The workspace root: ROCKYGPT_WORKSPACE_DIR, else the folder holding rockygpt-dev. */
function workspace() {
  const root = process.env.ROCKYGPT_WORKSPACE_DIR?.trim() || path.resolve(process.cwd(), '..');
  return {
    script: path.join(root, 'pull-production-graph.py'),
    target: path.join(root, '.local-logs', 'production-graph'),
  };
}

function readJson(file: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(readFileSync(file, 'utf8'));
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

let running = false;

export function GET() {
  const { script, target } = workspace();
  const pointer = readJson(path.join(target, 'active.json'));
  const artifact = readJson(path.join(target, 'artifact.json'));
  return Response.json({
    available: existsSync(script),
    running,
    release: typeof pointer?.dataset_version === 'string' ? pointer.dataset_version : null,
    shared: typeof artifact?.created_at === 'string' ? artifact.created_at : null,
  });
}

export function POST() {
  const { script, target } = workspace();
  const encoder = new TextEncoder();
  const line = (value: object) => encoder.encode(`${JSON.stringify(value)}\n`);

  if (!existsSync(script)) {
    return Response.json(
      { step: 'error', message: `pull-production-graph.py was not found next to rockygpt-dev (${script}).` },
      { status: 404 }
    );
  }
  if (running) {
    return Response.json({ step: 'error', message: 'A sync is already running.' }, { status: 409 });
  }
  running = true;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let finished = false;
      let reported = false;
      let stderr = '';
      let pending = '';
      const finish = (last?: object) => {
        if (finished) return;
        finished = true;
        running = false;
        try {
          if (last) controller.enqueue(line(last));
          controller.close();
        } catch {
          // The page went away; the copy is still replaced or left as it was.
        }
      };

      const child = spawn('python3', [script, target, '--force', '--events'], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => {
        pending += chunk;
        const lines = pending.split('\n');
        pending = lines.pop() ?? '';
        for (const text of lines) {
          if (!text.trim().startsWith('{')) continue;
          if (/"step":\s*"(done|error)"/.test(text)) reported = true;
          try {
            controller.enqueue(encoder.encode(`${text.trim()}\n`));
          } catch {
            // The page went away; let the script finish on its own.
          }
        }
      });
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (chunk: string) => {
        stderr = (stderr + chunk).slice(-2000);
      });
      child.on('error', (error) => {
        finish({ step: 'error', message: `Could not start python3: ${error.message}` });
      });
      child.on('close', (code) => {
        if (reported) return finish();
        finish({
          step: 'error',
          message: stderr.trim().split('\n').pop() || `The sync stopped (exit code ${code}).`,
        });
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
    },
  });
}
