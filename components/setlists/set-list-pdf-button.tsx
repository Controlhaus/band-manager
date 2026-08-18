"use client";
import * as React from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export function SetListPdfButton({
  setListId,
  variant = "outline",
  size = "sm",
  label = "PDF",
}: {
  setListId: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  label?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [times, setTimes] = React.useState(false);
  const [notes, setNotes] = React.useState(true);

  function openPdf() {
    const params = new URLSearchParams();
    if (notes) params.set("notes", "1");
    if (times) params.set("times", "1");
    const qs = params.toString();
    window.open(`/set-lists/${setListId}/print${qs ? `?${qs}` : ""}`, "_blank");
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size={size} variant={variant}>
          <Printer /> {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 space-y-3">
        <p className="text-sm font-medium">Print options</p>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={times} onCheckedChange={(v) => setTimes(Boolean(v))} />
          Include times
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={notes} onCheckedChange={(v) => setNotes(Boolean(v))} />
          Include notes
        </label>
        <Button size="sm" className="w-full" onClick={openPdf}>
          <Printer /> Open print view
        </Button>
      </PopoverContent>
    </Popover>
  );
}
