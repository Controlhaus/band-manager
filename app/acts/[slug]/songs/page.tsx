import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { loadActForUser } from "@/lib/act-access";
import { can } from "@/lib/roles";
import {
  queryCatalog,
  isCatalogSort,
  type CatalogSort,
} from "@/lib/song-catalog";
import { CatalogFilters } from "@/components/songs/catalog-filters";
import { CatalogTable } from "@/components/songs/catalog-table";
import { CreateSongDialog } from "@/components/songs/create-song-dialog";
import { ImportAlbumDialog } from "@/components/songs/import-album-dialog";

export const dynamic = "force-dynamic";

export default async function SongsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const user = await requireSession();
  const act = await loadActForUser(user, slug);
  if (!act) notFound();

  const sort: CatalogSort =
    sp.sort && isCatalogSort(sp.sort) ? sp.sort : "default";
  const order = sp.order === "desc" ? "desc" : "asc";
  const page = Math.max(1, Number(sp.page ?? "1") || 1);

  const result = await queryCatalog({
    actId: act.id,
    userId: user.id,
    search: sp.q?.trim() || undefined,
    style: sp.style || undefined,
    status: sp.status || undefined,
    sort,
    order,
    page,
  });

  const canWrite = can(act.role, "song:write");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Songs</h1>
          <p className="text-muted-foreground">{result.total} in the catalog</p>
        </div>
        {canWrite && (
          <div className="flex items-center gap-2">
            <ImportAlbumDialog actId={act.id} />
            <CreateSongDialog actId={act.id} slug={slug} />
          </div>
        )}
      </div>

      <CatalogFilters
        styles={result.styles}
        current={{ q: sp.q ?? "", style: sp.style ?? "", status: sp.status ?? "" }}
      />

      <CatalogTable
        slug={slug}
        rows={result.rows}
        sort={sort}
        order={order}
        page={result.page}
        pageCount={result.pageCount}
        canWrite={canWrite}
      />
    </div>
  );
}
