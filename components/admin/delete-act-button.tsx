"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deleteAct } from "@/app/actions/acts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";

export function DeleteActButton({
  actId,
  actName,
}: {
  actId: string;
  actName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [confirm, setConfirm] = React.useState("");

  async function onDelete() {
    setPending(true);
    const res = await deleteAct({ actId, confirmName: confirm });
    setPending(false);
    if (!res.ok) {
      toast({ variant: "destructive", title: "Could not delete", description: res.error });
      return;
    }
    toast({ title: "Act deleted" });
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Delete act">
          <Trash2 className="text-destructive" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {actName}?</DialogTitle>
          <DialogDescription>
            This permanently deletes the act and all of its songs, calendar
            entries, setlists, and files. Type the act name to confirm.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="confirm">Act name</Label>
          <Input
            id="confirm"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={actName}
          />
        </div>
        <DialogFooter>
          <Button
            variant="destructive"
            disabled={pending || confirm !== actName}
            onClick={onDelete}
          >
            {pending ? "Deleting…" : "Delete act"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
