import { describe, expect, it } from "vitest";
import { buildLyricsTxt, type LyricsExportItem } from "@/lib/setlist-export";

/**
 * Covers the plain-text lyrics booklet formatter used by the set-list lyrics
 * export (header = title — artist, form-feed page breaks between songs).
 */

describe("buildLyricsTxt", () => {
  it("renders a title/artist header followed by trimmed lyrics", () => {
    const items: LyricsExportItem[] = [
      { title: "Yellow", artist: "Coldplay", lyrics: "\nLook at the stars\n" },
    ];
    expect(buildLyricsTxt(items)).toBe("Yellow — Coldplay\n\nLook at the stars\n\n");
  });

  it("omits the artist separator when there is no artist", () => {
    const items: LyricsExportItem[] = [
      { title: "Untitled", artist: null, lyrics: "la la la" },
    ];
    expect(buildLyricsTxt(items)).toBe("Untitled\n\nla la la\n\n");
  });

  it("separates songs with a form feed for page-aware printing", () => {
    const items: LyricsExportItem[] = [
      { title: "One", artist: "A", lyrics: "first" },
      { title: "Two", artist: "B", lyrics: "second" },
    ];
    const out = buildLyricsTxt(items);
    expect(out).toContain("\f");
    expect(out.split("\f")).toHaveLength(2);
    expect(out).toBe("One — A\n\nfirst\n\n\f\nTwo — B\n\nsecond\n\n");
  });

  it("returns just a trailing newline for an empty set", () => {
    expect(buildLyricsTxt([])).toBe("\n");
  });
});
