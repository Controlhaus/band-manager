import { afterEach, describe, expect, it, vi } from "vitest";
import {
  searchReleases,
  getReleaseTracks,
  streamingSearchLinks,
} from "@/lib/musicbrainz";

/**
 * Covers MusicBrainz response normalisation (release search + tracklist) and
 * the Spotify/Apple search-link builder used by the album-import feature.
 */

function mockFetchOnce(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: init.ok ?? true,
      status: init.status ?? 200,
      json: async () => body,
    })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("searchReleases", () => {
  it("normalises releases and filters out those with no tracks", async () => {
    mockFetchOnce({
      releases: [
        {
          id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
          title: "OK Computer",
          date: "1997-06-16",
          country: "GB",
          "track-count": 12,
          "artist-credit": [{ name: "Radiohead" }],
          "cover-art-archive": { front: true },
        },
        {
          // No track-count nor media -> filtered out.
          id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
          title: "Empty",
          "artist-credit": [{ name: "Nobody" }],
        },
      ],
    });

    const res = await searchReleases("Radiohead", "OK Computer");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data).toHaveLength(1);
    expect(res.data[0]).toMatchObject({
      id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      title: "OK Computer",
      artist: "Radiohead",
      year: 1997,
      country: "GB",
      trackCount: 12,
      hasCoverArt: true,
    });
  });

  it("sums media track counts when track-count is absent", async () => {
    mockFetchOnce({
      releases: [
        {
          id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
          title: "Double",
          "artist-credit": [
            { name: "A", joinphrase: " & " },
            { name: "B" },
          ],
          media: [{ "track-count": 5 }, { "track-count": 6 }],
        },
      ],
    });

    const res = await searchReleases("A", "Double");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data[0]?.trackCount).toBe(11);
    expect(res.data[0]?.artist).toBe("A & B");
  });

  it("maps a 503 to a friendly error", async () => {
    mockFetchOnce({}, { ok: false, status: 503 });
    const res = await searchReleases("X", "Y");
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toMatch(/busy/i);
  });
});

describe("getReleaseTracks", () => {
  it("normalises tracks: ms->sec, position, and top genre", async () => {
    mockFetchOnce({
      id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      title: "OK Computer",
      "artist-credit": [{ name: "Radiohead" }],
      "cover-art-archive": { front: true },
      media: [
        {
          tracks: [
            {
              position: 1,
              title: "Airbag",
              length: 284000,
              recording: {
                genres: [
                  { name: "rock", count: 2 },
                  { name: "alternative rock", count: 9 },
                ],
              },
            },
            {
              // no length, no recording genres -> falls back to null
              position: 2,
              title: "Paranoid Android",
              length: null,
              recording: { genres: [] },
            },
          ],
        },
      ],
    });

    const res = await getReleaseTracks("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.hasCoverArt).toBe(true);
    expect(res.data.tracks[0]).toEqual({
      title: "Airbag",
      trackNo: 1,
      durationSec: 284,
      style: "alternative rock",
    });
    expect(res.data.tracks[1]).toEqual({
      title: "Paranoid Android",
      trackNo: 2,
      durationSec: null,
      style: null,
    });
  });

  it("falls back to release-group genre when a recording has none", async () => {
    mockFetchOnce({
      id: "dddddddd-dddd-dddd-dddd-dddddddddddd",
      title: "Album",
      "artist-credit": [{ name: "Band" }],
      "release-group": { genres: [{ name: "jazz", count: 3 }] },
      media: [{ tracks: [{ position: 1, title: "Tune", length: 60000 }] }],
    });

    const res = await getReleaseTracks("dddddddd-dddd-dddd-dddd-dddddddddddd");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.tracks[0]?.style).toBe("jazz");
  });
});

describe("streamingSearchLinks", () => {
  it("builds encoded Spotify + Apple search links that pass host checks", () => {
    const links = streamingSearchLinks("Sigur Rós", "Svefn-g-englar");
    const spotify = links.find((l) => l.platform === "SPOTIFY")!;
    const apple = links.find((l) => l.platform === "APPLE_MUSIC")!;

    // Encoded term, no raw spaces.
    expect(spotify.url).toContain("Sigur%20R%C3%B3s%20Svefn-g-englar");
    expect(apple.url).toContain("term=Sigur%20R%C3%B3s%20Svefn-g-englar");

    // Hosts satisfy the SongLink platform validation (spotify / apple).
    expect(new URL(spotify.url).hostname).toContain("spotify");
    expect(new URL(apple.url).hostname).toContain("apple");
  });
});
