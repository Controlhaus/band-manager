/**
 * Remove orphaned upload files — disk files with no matching FileAsset row
 * (§14.4). Run manually or via cron:
 *   npx tsx scripts/prune-orphan-files.ts
 */
import { readdir, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../lib/prisma";
import { env } from "../lib/env";

async function walk(dir: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) files.push(...(await walk(full)));
    else files.push(full);
  }
  return files;
}

async function main() {
  const root = env.uploadDir;
  const known = new Set(
    (await prisma.fileAsset.findMany({ select: { storagePath: true } })).map((f) =>
      path.resolve(root, f.storagePath),
    ),
  );

  const onDisk = await walk(root);
  let removed = 0;
  for (const file of onDisk) {
    const resolved = path.resolve(file);
    if (!known.has(resolved)) {
      const info = await stat(resolved).catch(() => null);
      // Skip very recent files (may be mid-upload).
      if (info && Date.now() - info.mtimeMs < 60_000) continue;
      await unlink(resolved).catch(() => undefined);
      removed++;
      console.log(`removed orphan: ${file}`);
    }
  }
  console.log(`✓ pruned ${removed} orphan file(s) of ${onDisk.length} on disk.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
