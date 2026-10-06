/**
 * @module lib/dev-format
 * Dollar figures from the Brain's nanodollar numbers. The scale comes from the Brain
 * (`nusdPerDollar`); when it is missing or not a positive number these return null so a page
 * can say the figure is unavailable instead of guessing a scale.
 */

function validScale(nusdPerDollar: number | null | undefined): nusdPerDollar is number {
  return typeof nusdPerDollar === 'number' && Number.isFinite(nusdPerDollar) && nusdPerDollar > 0;
}

/** The price of a million tokens, such as "$1.5", given the price of one token in nanodollars. */
export function dollarsPerMillionTokens(
  nusdPerToken: number,
  nusdPerDollar: number | null | undefined
): string | null {
  if (!validScale(nusdPerDollar)) return null;
  const dollars = (nusdPerToken * 1_000_000) / nusdPerDollar;
  return `$${dollars.toLocaleString('en-US', { maximumFractionDigits: 6 })}`;
}

/** An amount of nanodollars as dollars, with enough decimals to show every nanodollar. */
export function formatSpend(
  nusd: number,
  nusdPerDollar: number | null | undefined
): string | null {
  if (!validScale(nusdPerDollar)) return null;
  const decimals = Math.min(12, Math.ceil(Math.log10(nusdPerDollar)));
  return `$${(nusd / nusdPerDollar).toLocaleString('en-US', { maximumFractionDigits: decimals })}`;
}
