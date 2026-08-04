/**
 * String normalization + similarity helpers for song import matching (§18.9).
 *
 * Pure, no I/O. `normalizeForMatch` produces the canonical form used for both
 * dedupe checks and Dice scoring; `diceCoefficient` is Sørensen–Dice over
 * character bigrams. (Distinct from `lib/normalize.ts`, which is email-only.)
 */

/**
 * Canonicalise a title/artist string for matching: lowercase, strip diacritics,
 * expand `&`→`and`, unify `feat.`/`ft.`/`featuring`→`feat`, drop punctuation,
 * collapse whitespace.
 */
export function normalizeForMatch(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip combining marks
    .replace(/&/g, " and ")
    .replace(/\b(feat\.?|ft\.?|featuring)\b/g, "feat")
    .replace(/[^a-z0-9\s]/g, " ") // drop remaining punctuation
    .replace(/\s+/g, " ")
    .trim();
}

function bigrams(value: string): Map<string, number> {
  const map = new Map<string, number>();
  for (let i = 0; i < value.length - 1; i++) {
    const pair = value.slice(i, i + 2);
    map.set(pair, (map.get(pair) ?? 0) + 1);
  }
  return map;
}

/** Sørensen–Dice similarity over character bigrams, in [0,1]. */
export function diceCoefficient(a: string, b: string): number {
  if (a === b) return a.length === 0 ? 0 : 1;
  if (a.length < 2 || b.length < 2) return 0;
  const bigramsA = bigrams(a);
  const bigramsB = bigrams(b);
  let intersection = 0;
  for (const [pair, countA] of bigramsA) {
    const countB = bigramsB.get(pair);
    if (countB) intersection += Math.min(countA, countB);
  }
  return (2 * intersection) / (a.length - 1 + (b.length - 1));
}

/** Dice similarity of two raw strings after normalization. */
export function similarity(a: string, b: string): number {
  return diceCoefficient(normalizeForMatch(a), normalizeForMatch(b));
}

/** True when the normalized `haystack` contains the normalized `needle`. */
export function normalizedContains(haystack: string, needle: string): boolean {
  const h = normalizeForMatch(haystack);
  const n = normalizeForMatch(needle);
  return n.length > 0 && h.includes(n);
}
