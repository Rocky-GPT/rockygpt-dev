/**
 * Repeat Test, on the dev server: the question sets in the laptop's rockygpt-evals folder,
 * and one try of one question.
 *
 * Sets live in rockygpt-evals' dated folders (fresh-2026-11-03/, tonight-2026-11-02/, ...):
 * a JSON list of {id, question, good_reply, must_not}, or a questions.txt with one per line.
 * Frozen sets (a file name with "frozen") are listed but locked: they are run once, by hand.
 */

import 'server-only';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { askWay } from './laptop-vs-production-server';
import { failedReply, type WayResult } from './laptop-vs-production';
import { isFrozen, readSetFile, type QuestionSet, type RepeatBrain, type RepeatQuestion } from './repeat-test';

/** The workspace root: ROCKYGPT_WORKSPACE_DIR, else the folder holding rockygpt-dev. */
function evalsFolder(): string {
  const root = process.env.ROCKYGPT_WORKSPACE_DIR?.trim() || path.resolve(process.cwd(), '..');
  return path.join(root, 'rockygpt-evals');
}

/** Dated folders only: the older checkpoint and corpus folders hold conversations and results, not sets. */
const SET_FOLDER = /-20\d\d-\d\d-\d\d$/;
const MAX_DEPTH = 3;

async function walk(folder: string, depth: number, found: string[]) {
  let entries;
  try {
    entries = await readdir(folder, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const full = path.join(folder, entry.name);
    if (entry.isDirectory()) {
      if (depth < MAX_DEPTH) await walk(full, depth + 1, found);
    } else if (entry.name.endsWith('.json') || entry.name === 'questions.txt') {
      found.push(full);
    }
  }
}

function setName(relative: string): { name: string; folder: string } {
  const parts = relative.split(path.sep);
  const file = parts[parts.length - 1].replace(/\.(json|txt)$/, '');
  const folder = parts.slice(0, -1).join('/');
  // questions.txt, questions-frozen.json: name the set after its folder.
  const name = /^questions(-frozen)?$/.test(file) ? (parts[parts.length - 2] ?? file) : file;
  return { name: name.replace(/-20\d\d-\d\d-\d\d$/, ''), folder: parts[0] ?? folder };
}

function folderDate(folder: string): string {
  return /20\d\d-\d\d-\d\d$/.exec(folder)?.[0] ?? '';
}

export async function listSets(): Promise<{ folder: string; sets: QuestionSet[] }> {
  const root = evalsFolder();
  let top;
  try {
    top = await readdir(root, { withFileTypes: true });
  } catch {
    return { folder: root, sets: [] };
  }
  const files: string[] = [];
  for (const entry of top) {
    if (entry.isDirectory() && SET_FOLDER.test(entry.name)) await walk(path.join(root, entry.name), 1, files);
  }
  const sets: QuestionSet[] = [];
  for (const file of files) {
    const relative = path.relative(root, file);
    const questions = readSetFile(file, await readFile(file, 'utf8').catch(() => ''));
    if (!questions.length) continue;
    sets.push({ path: relative.split(path.sep).join('/'), ...setName(relative), count: questions.length, locked: isFrozen(relative) });
  }
  // Unlocked before locked, newest folder first, then by name.
  sets.sort(
    (a, b) =>
      Number(a.locked) - Number(b.locked) ||
      folderDate(b.folder).localeCompare(folderDate(a.folder)) ||
      a.folder.localeCompare(b.folder) ||
      a.name.localeCompare(b.name)
  );
  return { folder: root, sets };
}

/** One listed set's questions. Only a path the listing offers is read, and never a frozen one. */
export async function loadSet(wanted: string): Promise<{ set: QuestionSet; questions: RepeatQuestion[] } | { error: string }> {
  const { sets } = await listSets();
  const set = sets.find((item) => item.path === wanted);
  if (!set) return { error: 'That set is not in rockygpt-evals.' };
  if (set.locked) return { error: 'That set is frozen: it is run once, by hand, never from here.' };
  const file = path.join(evalsFolder(), ...set.path.split('/'));
  return { set, questions: readSetFile(file, await readFile(file, 'utf8')) };
}

const BUSY_RETRIES = 8;
const BUSY_WAIT_MS = 1_500;

function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}

/**
 * One try. The laptop Brain is asked with diagnostics on, so its metrics carry the real
 * spend. When it is busy (another page is asking too, 429), the try waits and asks again.
 */
export async function askTry(brain: RepeatBrain, question: string, signal: AbortSignal): Promise<WayResult> {
  let result = failedReply(brain, 'Not asked.', 0);
  for (let attempt = 0; attempt <= BUSY_RETRIES && !signal.aborted; attempt += 1) {
    result = await askWay(brain, question, signal, { diagnostics: brain === 'laptop-brain' });
    if (result.http !== 429) return result;
    await wait(BUSY_WAIT_MS, signal);
  }
  return signal.aborted ? failedReply(brain, 'Stopped before it answered.', 0) : result;
}
