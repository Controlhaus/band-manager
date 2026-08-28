import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { isActMember } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { PrintControls } from "@/components/setlists/print-controls";

export const dynamic = "force-dynamic";

type LyricsSong = { id: string; title: string; artist: string | null; lyrics: string };

export default async function SetListLyricsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireSession();

  const setList = await prisma.setList.findUnique({
    where: { id },
    select: {
      name: true,
      actId: true,
      sets: {
        orderBy: { sortOrder: "asc" },
        select: {
          entries: {
            orderBy: { position: "asc" },
            select: {
              kind: true,
              song: { select: { id: true, title: true, artist: true, lyrics: true } },
            },
          },
        },
      },
    },
  });
  if (!setList) notFound();
  if (!(await isActMember(user, setList.actId))) notFound();

  // Flatten in set order, one entry per song, skipping songs without lyrics.
  const songs: LyricsSong[] = [];
  const seen = new Set<string>();
  for (const set of setList.sets) {
    for (const entry of set.entries) {
      const song = entry.song;
      if (entry.kind !== "SONG" || !song || !song.lyrics?.trim()) continue;
      if (seen.has(song.id)) continue;
      seen.add(song.id);
      songs.push({ id: song.id, title: song.title, artist: song.artist, lyrics: song.lyrics });
    }
  }

  return (
    <div className="mx-auto max-w-3xl bg-white p-8 text-black print:p-0">
      {/* One song per page; lyrics flow into a second column only when they
          overflow the first (column-fill: auto). Header is title + artist only. */}
      <style>{`
        @page { margin: 16mm; }
        @media print {
          .no-print { display: none !important; }
        }
        .song-page { break-after: page; page-break-after: always; }
        .song-page:last-child { break-after: auto; page-break-after: auto; }
        .lyrics-cols {
          columns: 2;
          column-gap: 2rem;
          column-fill: auto;
          height: 240mm;
        }
        @media screen {
          .lyrics-cols { height: auto; }
        }
      `}</style>

      <PrintControls />

      {songs.length === 0 ? (
        <p className="text-sm text-neutral-500">
          No songs in this set list have lyrics yet.
        </p>
      ) : (
        songs.map((song) => (
          <section key={song.id} className="song-page">
            <header className="mb-4 border-b border-neutral-300 pb-2">
              <h1 className="text-2xl font-bold tracking-tight">{song.title}</h1>
              {song.artist && (
                <h2 className="text-lg text-neutral-600">{song.artist}</h2>
              )}
            </header>
            <div className="lyrics-cols whitespace-pre-wrap text-sm leading-relaxed">
              {song.lyrics.trim()}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
