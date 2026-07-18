"use client";
import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SONG_STATUSES } from "@/lib/types";

export function CatalogFilters({
  styles,
  current,
}: {
  styles: string[];
  current: { q: string; style: string; status: string };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [q, setQ] = React.useState(current.q);

  function apply(patch: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
    params.delete("page"); // reset pagination on filter change
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <form
        className="flex-1"
        onSubmit={(e) => {
          e.preventDefault();
          apply({ q });
        }}
      >
        <Input
          placeholder="Search title or artist…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </form>
      <Select
        value={current.style || "all"}
        onValueChange={(v) => apply({ style: v === "all" ? "" : v })}
      >
        <SelectTrigger className="w-full sm:w-44">
          <SelectValue placeholder="Style" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All styles</SelectItem>
          {styles.map((s) => (
            <SelectItem key={s} value={s}>
              {s}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={current.status || "all"}
        onValueChange={(v) => apply({ status: v === "all" ? "" : v })}
      >
        <SelectTrigger className="w-full sm:w-44">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          {SONG_STATUSES.map((s) => (
            <SelectItem key={s} value={s}>
              {s.charAt(0) + s.slice(1).toLowerCase()}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
