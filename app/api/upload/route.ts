import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { requireCapability } from "@/lib/permissions";
import { validateUpload, writeUpload } from "@/lib/files";
import { maxUploadBytes, env } from "@/lib/env";
import type { FileEntityType, FileKind } from "@prisma/client";

/**
 * Multipart upload handler (§8 `uploadFile`, §9). Reads the stream directly,
 * validates mime + size (magic-byte sniffing), stores under UPLOAD_DIR/<actId>/,
 * and records a FileAsset. The act is derived from the target entity so the
 * client cannot spoof it.
 */

const ENTITY_TYPES: FileEntityType[] = ["SONG", "SONG_VERSION", "CALENDAR_ENTRY"];
const FILE_KINDS: FileKind[] = ["LEAD_SHEET", "LYRICS", "ATTACHMENT", "OTHER"];

async function resolveAct(
  entityType: FileEntityType,
  entityId: string,
): Promise<string | null> {
  if (entityType === "SONG") {
    const s = await prisma.song.findUnique({
      where: { id: entityId },
      select: { actId: true },
    });
    return s?.actId ?? null;
  }
  if (entityType === "SONG_VERSION") {
    const v = await prisma.songVersion.findUnique({
      where: { id: entityId },
      select: { song: { select: { actId: true } } },
    });
    return v?.song.actId ?? null;
  }
  const e = await prisma.calendarEntry.findUnique({
    where: { id: entityId },
    select: { actId: true },
  });
  return e?.actId ?? null;
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const form = await req.formData();
  const file = form.get("file");
  const entityType = String(form.get("entityType") ?? "") as FileEntityType;
  const entityId = String(form.get("entityId") ?? "");
  const kind = (String(form.get("kind") ?? "ATTACHMENT") as FileKind) || "ATTACHMENT";

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }
  if (!ENTITY_TYPES.includes(entityType) || !entityId) {
    return NextResponse.json({ error: "Invalid target." }, { status: 400 });
  }
  if (!FILE_KINDS.includes(kind)) {
    return NextResponse.json({ error: "Invalid file kind." }, { status: 400 });
  }
  if (file.size > maxUploadBytes) {
    return NextResponse.json(
      { error: `File exceeds the ${env.maxUploadMb}MB limit.` },
      { status: 413 },
    );
  }

  const actId = await resolveAct(entityType, entityId);
  if (!actId) {
    return NextResponse.json({ error: "Target not found." }, { status: 404 });
  }

  // SONG/SONG_VERSION need song:write; CALENDAR_ENTRY needs entry:addNotes.
  try {
    await requireCapability(
      session,
      actId,
      entityType === "CALENDAR_ENTRY" ? "entry:addNotes" : "song:write",
    );
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const validation = await validateUpload(buffer, file.name, kind);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const storagePath = await writeUpload(actId, buffer);
  const asset = await prisma.fileAsset.create({
    data: {
      entityType,
      entityId,
      kind,
      actId,
      filename: file.name.slice(0, 255),
      storagePath,
      mimeType: validation.mimeType,
      sizeBytes: buffer.length,
      uploadedById: session.id,
    },
    select: { id: true },
  });

  return NextResponse.json({ ok: true, id: asset.id });
}
