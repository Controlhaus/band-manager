import { describe, expect, it, vi } from "vitest";
import { parseImportText } from "@/lib/import/parse";
import { findDuplicate } from "@/lib/import/resolve";
import { createVersionFromCandidate } from "@/lib/import/apply";
import type { TrackCandidate } from "@/lib/external/types";

function candidate(overrides: Partial<TrackCandidate> = {}): TrackCandidate {
  return {
    title: "Rain King",
    artist: "Counting Crows",
    album: "August and Everything After",
    durationSec: 260,
    releaseDate: null,
    appleTrackId: "12345",
    appleCollectionId: "999",
    trackViewUrl: "https://music.apple.com/us/album/x/1?i=12345",
    artworkUrl: null,
    previewUrl: null,
    genre: "Rock",
    score: 1,
    ...overrides,
  };
}

describe("parseImportText (§18.8 / §19)", () => {
  it("splits `Title, Artist` on the comma", () => {
    const [line] = parseImportText("Rain King, Counting Crows");
    expect(line).toMatchObject({
      parsedTitle: "Rain King",
      parsedArtist: "Counting Crows",
      hadSeparator: true,
    });
  });

  it("prefers a strong separator over a comma inside the title", () => {
    const [line] = parseImportText("Hello, Goodbye - The Beatles");
    // Dash wins, so the comma stays inside the left side.
    expect(line?.parsedArtist).toBe("Hello, Goodbye");
    expect(line?.parsedTitle).toBe("The Beatles");
  });

  it("treats `by` and dash orderings, enumeration and album hints", () => {
    const lines = parseImportText(
      [
        "1. So What by Miles Davis",
        "Miles Davis - So What",
        "Wonderwall - Oasis (What's the Story)",
      ].join("\n"),
    );
    expect(lines[0]).toMatchObject({ parsedTitle: "So What", parsedArtist: "Miles Davis" });
    expect(lines[1]).toMatchObject({ parsedArtist: "Miles Davis", parsedTitle: "So What" });
    expect(lines[2]?.parsedAlbumHint).toBe("What's the Story");
  });

  it("skips blank lines and set separators", () => {
    const lines = parseImportText("Set 1\n\nNo Rain, Blind Melon\n---\nEncore");
    expect(lines).toHaveLength(1);
    expect(lines[0]?.parsedTitle).toBe("No Rain");
  });

  it("strips leading numbering/bullets from the stored line", () => {
    const lines = parseImportText(
      "1. Suck My Kiss, Red Hot Chili Peppers\n10. Lightning Crashes, Live\n- Even Flow, Pearl Jam",
    );
    expect(lines.map((l) => l.rawLine)).toEqual([
      "Suck My Kiss, Red Hot Chili Peppers",
      "Lightning Crashes, Live",
      "Even Flow, Pearl Jam",
    ]);
    expect(lines[0]).toMatchObject({
      parsedTitle: "Suck My Kiss",
      parsedArtist: "Red Hot Chili Peppers",
    });
  });
});

describe("findDuplicate (§18.9 step 1)", () => {
  const songs = [{ id: "s1", title: "Rain King", artist: "Counting Crows" }];

  it("matches regardless of paste ordering", () => {
    const [a] = parseImportText("Rain King, Counting Crows");
    const [b] = parseImportText("Counting Crows - Rain King");
    expect(findDuplicate(a!, songs)).toBe("s1");
    expect(findDuplicate(b!, songs)).toBe("s1");
  });

  it("returns null when nothing matches", () => {
    const [line] = parseImportText("No Rain, Blind Melon");
    expect(findDuplicate(line!, songs)).toBeNull();
  });
});

describe("createVersionFromCandidate (§19.4)", () => {
  function fakeTx() {
    const songVersion = { create: vi.fn(async () => ({ id: "v1" })) };
    const songLink = { createMany: vi.fn(async () => ({ count: 2 })) };
    return { songVersion, songLink };
  }

  it("names the version from the candidate album and writes version-level links", async () => {
    const tx = fakeTx();
    const id = await createVersionFromCandidate(
      tx as unknown as Parameters<typeof createVersionFromCandidate>[0],
      "song1",
      candidate(),
    );
    expect(id).toBe("v1");
    expect(tx.songVersion.create).toHaveBeenCalledWith({
      data: { songId: "song1", name: "August and Everything After" },
      select: { id: true },
    });
    const rows = (
      tx.songLink.createMany.mock.calls[0] as unknown as [
        { data: Array<{ versionId: string | null; platform: string }> },
      ]
    )[0].data;
    // Every link carries the new version id and both platforms are present.
    expect(rows.every((r) => r.versionId === "v1")).toBe(true);
    expect(rows.map((r) => r.platform).sort()).toEqual([
      "APPLE_MUSIC",
      "SONGLINK",
    ]);
  });

  it("falls back to a default name when the candidate has no album", async () => {
    const tx = fakeTx();
    await createVersionFromCandidate(
      tx as unknown as Parameters<typeof createVersionFromCandidate>[0],
      "song1",
      candidate({ album: null }),
    );
    expect(tx.songVersion.create).toHaveBeenCalledWith({
      data: { songId: "song1", name: "Imported version" },
      select: { id: true },
    });
  });
});
