"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { updateEntryNotes } from "@/app/actions/calendar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Markdown } from "@/components/markdown";
import { toast } from "@/hooks/use-toast";

export function EntryNotes({
  entryId,
  notes,
  canEdit,
}: {
  entryId: string;
  notes: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [value, setValue] = React.useState(notes);
  const [pending, setPending] = React.useState(false);

  async function save() {
    setPending(true);
    const res = await updateEntryNotes({ entryId, notes: value });
    setPending(false);
    if (!res.ok) {
      toast({ variant: "destructive", title: "Could not save", description: res.error });
      return;
    }
    toast({ title: "Notes saved" });
    setEditing(false);
    router.refresh();
  }

  if (editing) {
    return (
      <div className="space-y-2">
        <Textarea value={value} onChange={(e) => setValue(e.target.value)} rows={6} />
        <div className="flex gap-2">
          <Button size="sm" onClick={save} disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setValue(notes);
              setEditing(false);
            }}
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {notes ? (
        <Markdown content={notes} />
      ) : (
        <p className="text-sm text-muted-foreground">No notes.</p>
      )}
      {canEdit && (
        <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
          <Pencil /> Edit notes
        </Button>
      )}
    </div>
  );
}
