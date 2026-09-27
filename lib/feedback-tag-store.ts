/**
 * @module lib/feedback-tag-store
 * Jev's feedback tags, kept in a git-ignored file on this machine.
 *
 * The file holds feedback IDs, labels, how sure Jev was and what sorting has
 * cost, never a question, answer or comment. Feedback itself stays in the
 * Brain's database; nothing here writes to it.
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { FeedbackTags } from './feedback-tags.ts';

export const DEFAULT_TAG_FILE = path.join(process.cwd(), '.data', 'feedback-tags.json');

export interface TagStore {
  tags: FeedbackTags;
  /** Everything sorting has cost on this machine, in nanodollars. */
  spentNusd: number;
}

export async function loadTags(file = DEFAULT_TAG_FILE): Promise<TagStore> {
  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { tags: {}, spentNusd: 0 };
    throw error;
  }
  const stored = JSON.parse(text) as Partial<TagStore>;
  return {
    tags: stored.tags && typeof stored.tags === 'object' ? stored.tags : {},
    spentNusd: typeof stored.spentNusd === 'number' ? stored.spentNusd : 0,
  };
}

/** Written to a temporary file and renamed, so a crash never leaves half a file. */
export async function saveTags(store: TagStore, file = DEFAULT_TAG_FILE): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
  await rename(temporary, file);
}
