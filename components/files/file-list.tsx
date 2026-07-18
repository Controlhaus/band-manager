"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Download, FileText, Trash2 } from "lucide-react";
import { deleteFileAsset } from "@/app/actions/files";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";

export type FileItem = {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
};

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileList({
  files,
  canManage,
}: {
  files: FileItem[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = React.useState<string | null>(null);

  async function remove(id: string) {
    if (!confirm("Delete this file?")) return;
    setPendingId(id);
    const res = await deleteFileAsset({ id });
    setPendingId(null);
    if (!res.ok) {
      toast({ variant: "destructive", title: "Could not delete", description: res.error });
      return;
    }
    toast({ title: "File deleted" });
    router.refresh();
  }

  if (files.length === 0) {
    return <p className="text-sm text-muted-foreground">No files.</p>;
  }

  return (
    <ul className="divide-y rounded-md border">
      {files.map((f) => (
        <li key={f.id} className="flex items-center justify-between gap-2 p-2">
          <a
            href={`/api/files/${f.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-w-0 items-center gap-2 hover:underline"
          >
            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{f.filename}</span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {fmtSize(f.sizeBytes)}
            </span>
          </a>
          <div className="flex shrink-0 items-center gap-1">
            <Button asChild variant="ghost" size="icon" className="h-8 w-8">
              <a href={`/api/files/${f.id}`} target="_blank" rel="noopener noreferrer" aria-label="Open file">
                <Download className="h-4 w-4" />
              </a>
            </Button>
            {canManage && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                disabled={pendingId === f.id}
                onClick={() => remove(f.id)}
                aria-label="Delete file"
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
