import "server-only";
import { randomBytes } from "node:crypto";
import { mkdir, rm, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileTypeFromBuffer } from "file-type";
import { prisma } from "./prisma";
import { env, maxUploadBytes } from "./env";
import type { FileEntityType, FileKind } from "@prisma/client";

/**
 * File storage on local disk (§7, §9, §15.1). Files live under
 * UPLOAD_DIR/<actId>/ with randomized names; the original name is kept in the
 * DB. Content type is sniffed from magic bytes, never trusted from the client.
 */

// Allowlists per kind (§9). Lead sheets are strict; attachments are broad but
// block executables.
const LEAD_SHEET_MIME = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
]);

const BLOCKED_MIME = new Set([
  "application/x-msdownload",
  "application/x-msdos-program",
  "application/x-executable",
  "application/x-elf",
  "application/x-mach-binary",
  "application/vnd.microsoft.portable-executable",
  "application/x-sh",
  "application/x-shellscript",
]);

const BLOCKED_EXT = new Set([
  ".exe", ".dll", ".bat", ".cmd", ".com", ".msi", ".sh", ".bash",
  ".ps1", ".scr", ".jar", ".app", ".deb", ".rpm",
]);

/** Mime types that may be previewed inline in the browser (§15.1). */
export const INLINE_PREVIEW_MIME = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
]);

export type UploadValidation =
  | { ok: true; mimeType: string }
  | { ok: false; error: string };

/**
 * Validate an uploaded buffer against size + kind allowlists, sniffing the
 * real content type. Returns the resolved mime type on success.
 */
export async function validateUpload(
  buffer: Buffer,
  originalName: string,
  kind: FileKind,
): Promise<UploadValidation> {
  if (buffer.length === 0) return { ok: false, error: "File is empty." };
  if (buffer.length > maxUploadBytes) {
    return { ok: false, error: `File exceeds the ${env.maxUploadMb}MB limit.` };
  }

  const ext = path.extname(originalName).toLowerCase();
  if (BLOCKED_EXT.has(ext)) {
    return { ok: false, error: "This file type is not allowed." };
  }

  const sniffed = await fileTypeFromBuffer(buffer);
  const mimeType = sniffed?.mime ?? "application/octet-stream";

  if (BLOCKED_MIME.has(mimeType)) {
    return { ok: false, error: "Executable files are not allowed." };
  }

  if (kind === "LEAD_SHEET" && !LEAD_SHEET_MIME.has(mimeType)) {
    return {
      ok: false,
      error: "Lead sheets must be a PDF, PNG, JPG or WebP file.",
    };
  }

  return { ok: true, mimeType };
}

function actDir(actId: string): string {
  return path.join(env.uploadDir, actId);
}

export function absoluteStoragePath(storagePath: string): string {
  return path.join(env.uploadDir, storagePath);
}

/** Persist a validated buffer to disk and return the relative storage path. */
export async function writeUpload(
  actId: string,
  buffer: Buffer,
): Promise<string> {
  await mkdir(actDir(actId), { recursive: true });
  const randomName = randomBytes(24).toString("hex");
  const relativePath = path.join(actId, randomName);
  await writeFile(absoluteStoragePath(relativePath), buffer);
  return relativePath;
}

/**
 * Delete all FileAssets for a polymorphic entity, removing DB rows and disk
 * files (§14.4). Disk failures are logged, never block the caller.
 * Pass a transaction client when running inside `prisma.$transaction`.
 */
export async function deleteAssetsFor(
  entityType: FileEntityType,
  entityId: string,
  tx: Pick<typeof prisma, "fileAsset"> = prisma,
): Promise<void> {
  const assets = await tx.fileAsset.findMany({
    where: { entityType, entityId },
    select: { id: true, storagePath: true },
  });
  if (assets.length === 0) return;

  await tx.fileAsset.deleteMany({ where: { entityType, entityId } });

  await Promise.all(
    assets.map((a) =>
      unlink(absoluteStoragePath(a.storagePath)).catch((err) =>
        console.error(`[files] failed to unlink ${a.storagePath}:`, err),
      ),
    ),
  );
}

/** Remove a single file asset's disk file (best-effort). */
export async function unlinkStorage(storagePath: string): Promise<void> {
  await unlink(absoluteStoragePath(storagePath)).catch((err) =>
    console.error(`[files] failed to unlink ${storagePath}:`, err),
  );
}

/** Remove an act's entire upload directory (used when deleting an act, §14.4). */
export async function removeActStorage(actId: string): Promise<void> {
  await rm(actDir(actId), { recursive: true, force: true }).catch((err) =>
    console.error(`[files] failed to remove act dir ${actId}:`, err),
  );
}
