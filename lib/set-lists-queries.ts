import { prisma } from "@/lib/prisma";

export type SongUsage = { setListId: string; setListName: string; setName: string };

/**
 * Every (set list › set) pair a song appears in — powers the song-detail
 * "Used in set lists" field. Server-only (imports Prisma).
 */
export async function songUsage(songId: string): Promise<SongUsage[]> {
  const entries = await prisma.setEntry.findMany({
    where: { songId },
    select: {
      set: {
        select: {
          name: true,
          setList: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: [{ set: { setList: { name: "asc" } } }, { set: { sortOrder: "asc" } }],
  });
  return entries.map((e) => ({
    setListId: e.set.setList.id,
    setListName: e.set.setList.name,
    setName: e.set.name,
  }));
}
