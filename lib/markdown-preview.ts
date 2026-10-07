/**
 * @module lib/markdown-preview
 * A plain-text view of a Markdown answer, for one- or two-line previews.
 *
 * The Brain writes answers in Markdown (bold office names, `[source](url)` links). A list row
 * cannot render links (the row is itself a button), so it shows this instead: every word the
 * Brain sent, with only the Markdown symbols dropped. Nothing is added, reworded or hidden; the
 * full answer in the inspector is the rendered Markdown.
 */

/** CommonMark lets any ASCII punctuation be backslash-escaped. */
const ESCAPED = /\\([!-/:-@[-`{-~])/g;
const HIDDEN = /[\uE121-\uE17E]/g;
const SHIFT = 0xe100;

/** An escaped character is parked out of the way while markers are stripped, then put back. */
const hide = (_: string, character: string) => String.fromCharCode(SHIFT + character.charCodeAt(0));
const show = (text: string) => text.replace(HIDDEN, hidden => String.fromCharCode(hidden.charCodeAt(0) - SHIFT));

function inline(raw: string): string {
  const text = raw.replace(ESCAPED, hide);
  return show(text
    // `![alt](src)` and `[label](url "title")` keep only the label (or the alt text).
    .replace(/!?\[([^\]]*)\]\(\s*[^)\s]*(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/g, '$1')
    // `<https://example.edu>` keeps the address.
    .replace(/<((?:https?:\/\/|mailto:)[^>\s]+)>/g, '$1')
    // Bold, then italics. Underscore emphasis is only recognised at word edges, so
    // `first_last@example.edu` survives.
    .replace(/\*\*([^*]+?)\*\*/g, '$1')
    .replace(/(?<![\w])__([^_]+?)__(?![\w])/g, '$1')
    .replace(/(?<![\w*])\*([^*\s](?:[^*]*[^*\s])?)\*(?![\w*])/g, '$1')
    .replace(/(?<![\w])_([^_\s](?:[^_]*[^_\s])?)_(?![\w])/g, '$1')
    .replace(/~~([^~]+?)~~/g, '$1')
    .replace(/`([^`]+)`/g, '$1'));
}

export function plainPreview(markdown: string): string {
  const paragraphs = markdown.replace(/\r\n?/g, '\n').split(/\n[ \t]*\n/);
  const cleaned = paragraphs.map(paragraph => inline(paragraph
    .split('\n')
    .map(line => line
      .replace(/^\s{0,3}#{1,6}\s+/, '')
      .replace(/^\s{0,3}>\s?/, '')
      .replace(/^\s*[-*+]\s+/, ''))
    .join(' ')).replace(/\s+/g, ' ').trim());
  return cleaned.filter(Boolean).join(' · ');
}
