"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Copy, Trash2 } from "lucide-react";
import { duplicateSetList, deleteSetList } from "@/app/actions/set-lists";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/hooks/use-toast";

export function SetListRowActions({
  setListId,
  slug,
}: {
  setListId: string;
  slug: string;
}) {
  const router = useRouter();

  async function onDuplicate() {
    const res = await duplicateSetList({ setListId });
    if (!res.ok) {
      toast({ variant: "destructive", title: "Could not duplicate", description: res.error });
      return;
    }
    toast({ title: "Set list duplicated" });
    if (res.data?.id) router.push(`/acts/${slug}/setlists/${res.data.id}`);
    else router.refresh();
  }

  async function onDelete() {
    if (!confirm("Delete this set list?")) return;
    const res = await deleteSetList({ setListId });
    if (!res.ok) {
      toast({ variant: "destructive", title: "Could not delete", description: res.error });
      return;
    }
    toast({ title: "Set list deleted" });
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Set list actions">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onDuplicate}>
          <Copy className="mr-2 h-4 w-4" /> Duplicate
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
          <Trash2 className="mr-2 h-4 w-4" /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
