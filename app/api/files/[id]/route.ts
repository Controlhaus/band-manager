import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { isActMember } from "@/lib/permissions";
import { absoluteStoragePath, INLINE_PREVIEW_MIME } from "@/lib/files";

/**
 * Authenticated file streaming (§13.6, §15.1). Returns 403 for non-members.
 * Previewable types are served inline; everything else as an attachment.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const asset = await prisma.fileAsset.findUnique({ where: { id } });
  if (!asset) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!(await isActMember(session, asset.actId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let data: Buffer;
  try {
    data = await readFile(absoluteStoragePath(asset.storagePath));
  } catch {
    return NextResponse.json({ error: "File missing" }, { status: 404 });
  }

  const inline = INLINE_PREVIEW_MIME.has(asset.mimeType);
  const encodedName = encodeURIComponent(asset.filename).replace(/['()]/g, escape);
  const disposition = `${inline ? "inline" : "attachment"}; filename="${asset.filename.replace(/["\\]/g, "_")}"; filename*=UTF-8''${encodedName}`;

  return new NextResponse(new Uint8Array(data), {
    status: 200,
    headers: {
      "Content-Type": inline ? asset.mimeType : "application/octet-stream",
      "Content-Disposition": disposition,
      "Content-Length": String(asset.sizeBytes),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
