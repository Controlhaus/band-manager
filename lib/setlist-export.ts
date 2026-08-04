import type { SongPlatform } from "@prisma/client";

/**
 * Setlist export formatting (§18.12). Pure helpers shared by both export route
 * handlers (calendar-entry setlists and the reusable set-list library).
 */

export type ExportFormat = "m3u" | "csv" | "txt";

export function isExportFormat(v: string | null): v is ExportFormat {
  return v === "m3u" || v === "csv" || v === "txt";
}

/** A normalized item for export, resolved from a setlist/set entry. */
export interface ExportItem {
  position: number;
  title: string;
  artist: string | null;
  album: string | null;
  durationSec: number | null;
  key: string | null;
  tempoBpm: number | null;
  notes: string | null;
  /** platform → url, already resolved (version-level preferred over song). */
  links: Partial<Record<SongPlatform, string>>;
}

/** Preferred URL for a single item (for M3U): universal song.link, else Apple. */
function bestUrl(item: ExportItem): string | null {
  return (
    item.links.SONGLINK ??
    item.links.APPLE_MUSIC ??
    item.links.SPOTIFY ??
    item.links.YOUTUBE ??
    null
  );
}

function displayLine(item: ExportItem): string {
  return item.artist ? `${item.artist} - ${item.title}` : item.title;
}

export function buildM3u(items: ExportItem[]): string {
  const lines = ["#EXTM3U"];
  for (const item of items) {
    const dur = item.durationSec ?? -1;
    lines.push(`#EXTINF:${dur},${displayLine(item)}`);
    lines.push(bestUrl(item) ?? `# no link for: ${displayLine(item)}`);
  }
  return lines.join("\n") + "\n";
}

export function buildTxt(items: ExportItem[]): string {
  return items.map(displayLine).join("\n") + "\n";
}

function csvCell(value: string | number | null): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (/[",\r\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

export function buildCsv(items: ExportItem[]): string {
  const header = [
    "position",
    "title",
    "artist",
    "album",
    "duration_sec",
    "key",
    "tempo_bpm",
    "apple_url",
    "spotify_url",
    "youtube_url",
    "songlink_url",
    "notes",
  ];
  const rows = items.map((item) =>
    [
      item.position,
      item.title,
      item.artist,
      item.album,
      item.durationSec,
      item.key,
      item.tempoBpm,
      item.links.APPLE_MUSIC ?? null,
      item.links.SPOTIFY ?? null,
      item.links.YOUTUBE ?? null,
      item.links.SONGLINK ?? null,
      item.notes,
    ]
      .map(csvCell)
      .join(","),
  );
  return [header.join(","), ...rows].join("\r\n") + "\r\n";
}

export function renderExport(
  format: ExportFormat,
  items: ExportItem[],
): { body: string; contentType: string; ext: string } {
  switch (format) {
    case "m3u":
      return { body: buildM3u(items), contentType: "audio/x-mpegurl", ext: "m3u" };
    case "csv":
      return { body: buildCsv(items), contentType: "text/csv; charset=utf-8", ext: "csv" };
    case "txt":
      return { body: buildTxt(items), contentType: "text/plain; charset=utf-8", ext: "txt" };
  }
}

/** Slugify a name for a download filename. */
export function fileSlug(value: string): string {
  return (
    value
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "setlist"
  );
}
