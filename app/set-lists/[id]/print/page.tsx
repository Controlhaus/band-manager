import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { isActMember } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { formatDuration } from "@/lib/set-lists";
import { PrintControls } from "@/components/setlists/print-controls";

export const dynamic = "force-dynamic";

export default async function SetListPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notes?: string; times?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const includeNotes = sp.notes === "1";
  const includeTimes = sp.times === "1";

  const user = await requireSession();

  const setList = await prisma.setList.findUnique({
    where: { id },
    select: {
      name: true,
      actId: true,
      sets: {
        orderBy: { sortOrder: "asc" },
        select: {
          name: true,
          notes: true,
          entries: {
            orderBy: { position: "asc" },
            select: {
              kind: true,
              notes: true,
              banterDescription: true,
              banterSeconds: true,
              song: { select: { title: true, artist: true, durationSec: true } },
            },
          },
        },
      },
    },
  });
  if (!setList) notFound();
  if (!(await isActMember(user, setList.actId))) notFound();

  const setSeconds = (entries: (typeof setList.sets)[number]["entries"]): number =>
    entries.reduce(
      (sum, e) => sum + (e.kind === "BANTER" ? e.banterSeconds ?? 0 : e.song?.durationSec ?? 0),
      0,
    );

  return (
    <div className="mx-auto max-w-3xl bg-white p-8 text-black print:p-0">
      {/* Never include links/URLs. Notes and times are opt-in via query params. */}
      <style>{`
        @page { margin: 16mm; }
        @media print {
          .no-print { display: none !important; }
        }
        .set-page { break-after: page; page-break-after: always; }
        .set-page:last-child { break-after: auto; page-break-after: auto; }
      `}</style>

      <PrintControls />

      {setList.sets.length === 0 ? (
        <p className="text-sm text-neutral-500">This set list has no sets.</p>
      ) : (
        setList.sets.map((set, si) => {
          const total = setSeconds(set.entries);
          return (
            <section key={si} className="set-page">
              <header className="mb-4 border-b border-neutral-300 pb-2">
                <h1 className="text-2xl font-bold tracking-tight">{setList.name}</h1>
                <div className="mt-1 flex items-baseline justify-between gap-4">
                  <h2 className="text-lg font-semibold">{set.name}</h2>
                  {includeTimes && (
                    <span className="text-sm tabular-nums text-neutral-600">
                      {formatDuration(total)}
                    </span>
                  )}
                </div>
                {includeNotes && set.notes && (
                  <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-600">{set.notes}</p>
                )}
              </header>

              {set.entries.length === 0 ? (
                <p className="text-sm text-neutral-500">No songs in this set.</p>
              ) : (
                <ol className="space-y-1">
                  {set.entries.map((e, ei) => {
                    if (e.kind === "BANTER") {
                      return (
                        <li key={ei} className="flex items-baseline gap-3 py-0.5">
                          <span className="w-6 shrink-0" />
                          <span className="min-w-0 flex-1 italic text-neutral-600">
                            {e.banterDescription || "Banter"}
                            {includeNotes && e.notes && (
                              <span className="block text-sm not-italic text-neutral-500">
                                {e.notes}
                              </span>
                            )}
                          </span>
                          {includeTimes && (
                            <span className="shrink-0 tabular-nums text-neutral-600">
                              {e.banterSeconds ? formatDuration(e.banterSeconds) : "—"}
                            </span>
                          )}
                        </li>
                      );
                    }
                    const songNo = set.entries
                      .slice(0, ei + 1)
                      .filter((x) => x.kind === "SONG").length;
                    return (
                      <li key={ei} className="flex items-baseline gap-3 py-0.5">
                        <span className="w-6 shrink-0 text-right tabular-nums text-neutral-500">
                          {songNo}.
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="font-medium">{e.song?.title ?? "Untitled"}</span>
                          {e.song?.artist && (
                            <span className="text-neutral-600"> — {e.song.artist}</span>
                          )}
                          {includeNotes && e.notes && (
                            <span className="block text-sm text-neutral-500">{e.notes}</span>
                          )}
                        </span>
                        {includeTimes && (
                          <span className="shrink-0 tabular-nums text-neutral-600">
                            {e.song?.durationSec ? formatDuration(e.song.durationSec) : "—"}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>
          );
        })
      )}
    </div>
  );
}
