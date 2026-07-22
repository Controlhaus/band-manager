"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { createSetList } from "@/app/actions/set-lists";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";

export function CreateSetListDialog({
  actId,
  slug,
}: {
  actId: string;
  slug: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [name, setName] = React.useState("");
  const [notes, setNotes] = React.useState("");

  async function submit() {
    setPending(true);
    const res = await createSetList({ actId, name, notes: notes || undefined });
    setPending(false);
    if (!res.ok) {
      toast({ variant: "destructive", title: "Could not create set list", description: res.error });
      return;
    }
    toast({ title: "Set list created" });
    setOpen(false);
    setName("");
    setNotes("");
    if (res.data?.id) router.push(`/acts/${slug}/setlists/${res.data.id}`);
    else router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus /> New set list
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New set list</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="sl-name">Name</Label>
            <Input
              id="sl-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          {/* Notes always shown in create view, even when empty (§ notes rule). */}
          <div className="space-y-2">
            <Label htmlFor="sl-notes">Notes (optional)</Label>
            <Textarea
              id="sl-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={pending || !name.trim()}>
            {pending ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
