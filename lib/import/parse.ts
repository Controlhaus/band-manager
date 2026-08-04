/**
 * Bulk paste parser (§18.8). Pure function, no I/O, fully unit-testable.
 *
 * Turns raw multiline paste input into `ParsedLine[]`. The parser deliberately
 * does NOT decide artist/title ordering — `Miles Davis - So What` and
 * `So What - Miles Davis` are indistinguishable, so the resolver (§18.9) queries
 * both orderings and lets the scores decide.
 */

export type ParsedLine = {
  /** The original line (post-trim), preserved for display + storage. */
  rawLine: string;
  /** Best-guess title (right side of a separator, or the whole line). */
  parsedTitle: string;
  /** Best-guess artist (left side of a separator), or null when absent. */
  parsedArtist: string | null;
  /** Trailing album hint extracted from a `(…)`/`[…]` suffix, if any. */
  parsedAlbumHint: string | null;
  /** Whether a separator was found (⇒ the resolver tries both orderings). */
  hadSeparator: boolean;
};

/** Lines that are set separators, not songs (skipped). */
const SEPARATOR_RE = /^(set\s*\d+.*|-{3,}|encore|set\s*break|intermission)$/i;
/** Leading enumeration / bullet prefix. */
const ENUMERATION_RE = /^\s*(\d+[.):]|[-*•])\s+/;
/** Trailing parenthetical/bracket album hint. */
const ALBUM_HINT_RE = /\s*[([]([^)\]]+)[)\]]\s*$/;
/** Parenthetical contents that are part of the title, not an album hint. */
const TITLE_QUALIFIER_RE = /feat|ft\.?|featuring|remix|live|acoustic|reprise/i;
/** Strong separators: ` - `, ` – `, ` — `, ` | `, or ` by ` (case-insensitive). */
const SEPARATOR_SPLIT_RE = /\s+(-|–|—|\||by)\s+/i;
/**
 * Comma separator (`Title, Artist`). Only used as a fallback when no strong
 * separator is present, so a title that contains a comma (`Hello, Goodbye - The
 * Beatles`) still splits on the dash rather than the comma.
 */
const COMMA_SPLIT_RE = /\s*(,)\s+/;

function parseLine(raw: string): ParsedLine | null {
  const trimmed = raw.trim();
  if (trimmed === "" || SEPARATOR_RE.test(trimmed)) return null;

  // Drop any leading enumeration/bullet from the stored line too, so the review
  // UI shows "Suck My Kiss, …" rather than "1. Suck My Kiss, …".
  const cleaned = trimmed.replace(ENUMERATION_RE, "");
  let work = cleaned;

  let albumHint: string | null = null;
  const hintMatch = work.match(ALBUM_HINT_RE);
  if (hintMatch && hintMatch[1] && !TITLE_QUALIFIER_RE.test(hintMatch[1])) {
    albumHint = hintMatch[1].trim();
    work = work.slice(0, hintMatch.index).trim();
  }

  const sepMatch = work.match(SEPARATOR_SPLIT_RE) ?? work.match(COMMA_SPLIT_RE);
  if (!sepMatch || sepMatch.index === undefined) {
    return {
      rawLine: cleaned,
      parsedTitle: work,
      parsedArtist: null,
      parsedAlbumHint: albumHint,
      hadSeparator: false,
    };
  }

  const left = work.slice(0, sepMatch.index).trim();
  const right = work.slice(sepMatch.index + sepMatch[0].length).trim();
  const token = (sepMatch[1] ?? "").toLowerCase();
  // "Title by Artist" and "Title, Artist" put the title on the left; dash/pipe
  // default to "Artist - Title". The resolver tries both orderings regardless.
  const titleFirst = token === "by" || token === ",";
  const parsedTitle = titleFirst ? left : right;
  const parsedArtist = titleFirst ? right : left;

  return {
    rawLine: cleaned,
    parsedTitle: parsedTitle || work,
    parsedArtist: parsedArtist || null,
    parsedAlbumHint: albumHint,
    hadSeparator: true,
  };
}

/** Parse raw paste text into song lines (empties + set separators dropped). */
export function parseImportText(raw: string): ParsedLine[] {
  const lines: ParsedLine[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const parsed = parseLine(line);
    if (parsed) lines.push(parsed);
  }
  return lines;
}
