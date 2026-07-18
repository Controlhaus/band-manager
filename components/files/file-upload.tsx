"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import type { FileEntityType, FileKind } from "@prisma/client";

export function FileUpload({
  entityType,
  entityId,
  kind = "ATTACHMENT",
  accept,
  label = "Upload file",
}: {
  entityType: FileEntityType;
  entityId: string;
  kind?: FileKind;
  accept?: string;
  label?: string;
}) {
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [pending, setPending] = React.useState(false);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.set("file", file);
    form.set("entityType", entityType);
    form.set("entityId", entityId);
    form.set("kind", kind);

    setPending(true);
    try {
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "Upload failed",
          description: json.error ?? "Please try again.",
        });
        return;
      }
      toast({ title: "File uploaded" });
      router.refresh();
    } finally {
      setPending(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept={accept}
        onChange={onFile}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => inputRef.current?.click()}
      >
        <Upload /> {pending ? "Uploading…" : label}
      </Button>
    </>
  );
}
