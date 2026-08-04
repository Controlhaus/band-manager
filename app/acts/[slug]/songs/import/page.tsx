import { notFound, redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { loadActForUser } from "@/lib/act-access";
import { can } from "@/lib/roles";
import { env } from "@/lib/env";
import { ImportPasteForm } from "@/components/songs/import-paste-form";

export const dynamic = "force-dynamic";

export default async function SongImportPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const user = await requireSession();
  const act = await loadActForUser(user, slug);
  if (!act) notFound();
  if (!can(act.role, "song:write")) redirect(`/acts/${slug}/songs`);
  if (!env.musicResolutionEnabled) redirect(`/acts/${slug}/songs`);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Import songs</h1>
        <p className="text-muted-foreground">
          Paste a list of songs — one per line. We&apos;ll look up each one and
          let you review the matches before adding them.
        </p>
      </div>
      <ImportPasteForm actId={act.id} slug={slug} />
    </div>
  );
}
