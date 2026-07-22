"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { setBookingSetList } from "@/app/actions/bookings";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";

export function BookingSetListSelect({
  slug,
  groupId,
  currentId,
  currentName,
  setLists,
  canManage,
}: {
  slug: string;
  groupId: string;
  currentId: string | null;
  currentName: string | null;
  setLists: { id: string; name: string }[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  async function onChange(value: string) {
    const setListId = value === "none" ? null : value;
    setPending(true);
    const res = await setBookingSetList({ groupId, setListId });
    setPending(false);
    if (!res.ok) {
      toast({ variant: "destructive", title: "Could not update set list", description: res.error });
      return;
    }
    router.refresh();
  }

  if (!canManage) {
    return currentId ? (
      <Link href={`/acts/${slug}/setlists/${currentId}`} className="text-sm font-medium text-primary hover:underline">
        {currentName}
      </Link>
    ) : (
      <span className="text-sm text-muted-foreground">No set list</span>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <Select value={currentId ?? "none"} onValueChange={onChange} disabled={pending}>
        <SelectTrigger className="w-56">
          <SelectValue placeholder="None" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">None</SelectItem>
          {setLists.map((sl) => (
            <SelectItem key={sl.id} value={sl.id}>
              {sl.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {currentId && (
        <Link href={`/acts/${slug}/setlists/${currentId}`} className="text-sm text-primary hover:underline">
          Open
        </Link>
      )}
    </div>
  );
}
