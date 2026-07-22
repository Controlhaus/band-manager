import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { loadActForUser } from "@/lib/act-access";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/roles";
import { SetListEditor, type SetVM } from "@/components/setlists/set-list-editor";

export const dynamic = "force-dynamic";

export default async function SetListDetailPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const user = await requireSession();
  const act = await loadActForUser(user, slug);
  if (!act) notFound();

  const setList = await prisma.setList.findFirst({
    where: { id, actId: act.id },
    include: {
      sets: {
        orderBy: { sortOrder: "asc" },
        include: {
          entries: {
            orderBy: { position: "asc" },
            include: {
              song: { select: { id: true, title: true, artist: true, durationSec: true } },
            },
          },
          links: { orderBy: { sortOrder: "asc" } },
        },
      },
      links: { orderBy: { sortOrder: "asc" } },
      bookings: { select: { id: true, title: true }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!setList) notFound();

  const catalog = await prisma.song.findMany({
    where: { actId: act.id, status: { not: "RETIRED" } },
    select: { id: true, title: true, artist: true, durationSec: true, album: true },
    orderBy: { title: "asc" },
  });

  const canWrite = can(act.role, "setlist:write");

  const sets: SetVM[] = setList.sets.map((s) => ({
    id: s.id,
    name: s.name,
    notes: s.notes,
    links: s.links.map((l) => ({ id: l.id, url: l.url, label: l.label })),
    entries: s.entries.map((e) => ({
      id: e.id,
      kind: e.kind,
      notes: e.notes,
      songId: e.songId,
      title: e.song?.title ?? null,
      artist: e.song?.artist ?? null,
      songDurationSec: e.song?.durationSec ?? null,
      banterDescription: e.banterDescription,
      banterSeconds: e.banterSeconds,
    })),
  }));

  return (
    <SetListEditor
      slug={slug}
      canWrite={canWrite}
      setList={{
        id: setList.id,
        name: setList.name,
        notes: setList.notes,
        links: setList.links.map((l) => ({ id: l.id, url: l.url, label: l.label })),
      }}
      sets={sets}
      catalog={catalog}
      bookings={setList.bookings.map((b) => ({
        id: b.id,
        title: b.title,
        href: `/acts/${slug}/bookings/${b.id}`,
      }))}
    />
  );
}
