/**
 * @module lib/copy
 * Copy text to the clipboard. Resolves true only when the browser accepted it, so a button
 * never says "Copied" after a refusal or in a browser with no clipboard.
 */
export async function copyText(text: string): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.clipboard) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
