import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { loadActForUser } from "@/lib/act-access";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/roles";
import { formatDuration, setListSeconds } from "@/lib/set-lists";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { CreateSetListDialog } from "@/components/setlists/create-set-list-dialog";
import { SetListRowActions } from "@/components/setlists/set-list-row-actions";

export const dynamic = "force-dynamic";

export default async function SetListsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const user = await requireSession();
  const act = await loadActForUser(user, slug);
  if (!act) notFound();

  const setLists = await prisma.setList.findMany({
    where: { actId: act.id },
    include: {
      sets: {
        include: {
          entries: {
            select: {
              kind: true,
              banterSeconds: true,
              song: { select: { durationSec: true } },
            },
          },
        },
      },
      _count: { select: { bookings: true, sets: true } },
    },
    orderBy: { name: "asc" },
  });

  const canWrite = can(act.role, "setlist:write");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Set Lists</h1>
          <p className="text-muted-foreground">
            {setLists.length} set list{setLists.length === 1 ? "" : "s"}
          </p>
        </div>
        {canWrite && <CreateSetListDialog actId={act.id} slug={slug} />}
      </div>

      {setLists.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            No set lists yet.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {setLists.map((sl) => {
            const total = setListSeconds(sl.sets);
            return (
              <div
                key={sl.id}
                className="flex items-center justify-between gap-3 rounded-md border p-3 hover:bg-accent"
              >
                <Link href={`/acts/${slug}/setlists/${sl.id}`} className="min-w-0 flex-1">
                  <p className="truncate font-medium">{sl.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {sl._count.sets} set{sl._count.sets === 1 ? "" : "s"} ·{" "}
                    {formatDuration(total)}
                    {sl._count.bookings > 0 && (
                      <>
                        {" · "}
                        <span>
                          used in {sl._count.bookings} booking
                          {sl._count.bookings === 1 ? "" : "s"}
                        </span>
                      </>
                    )}
                  </p>
                </Link>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{formatDuration(total)}</Badge>
                  {canWrite && <SetListRowActions setListId={sl.id} slug={slug} />}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
