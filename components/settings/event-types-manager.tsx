"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import {
  upsertEventType,
  deleteEventType,
  setGlobalEventTypeEnabled,
} from "@/app/actions/calendar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";

export function EventTypesManager({
  actId,
  global,
  actTypes,
}: {
  actId: string;
  global: { id: string; name: string; enabled: boolean }[];
  actTypes: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [pending, setPending] = React.useState(false);

  async function toggleGlobal(eventTypeId: string, enabled: boolean) {
    const res = await setGlobalEventTypeEnabled({ actId, eventTypeId, enabled });
    if (!res.ok) {
      toast({ variant: "destructive", title: "Could not update", description: res.error });
      return;
    }
    router.refresh();
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setPending(true);
    const res = await upsertEventType({ actId, name });
    setPending(false);
    if (!res.ok) {
      toast({ variant: "destructive", title: "Could not add", description: res.error });
      return;
    }
    toast({ title: "Event type added" });
    setName("");
    router.refresh();
  }

  async function remove(id: string) {
    const res = await deleteEventType({ actId, id });
    if (!res.ok) {
      toast({ variant: "destructive", title: "Could not delete", description: res.error });
      return;
    }
    toast({ title: "Event type deleted" });
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-sm font-medium">Global types</p>
        <ul className="divide-y rounded-md border">
          {global.map((t) => (
            <li key={t.id} className="flex items-center justify-between p-2">
              <span className="flex items-center gap-2">
                {t.name}
                <Badge variant="secondary">Global</Badge>
              </span>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                {t.enabled ? "Shown" : "Hidden"}
                <Switch
                  checked={t.enabled}
                  onCheckedChange={(v) => toggleGlobal(t.id, v)}
                  aria-label={`Toggle ${t.name} for this act`}
                />
              </label>
            </li>
          ))}
          {global.length === 0 && (
            <li className="p-2 text-sm text-muted-foreground">No global types.</li>
          )}
        </ul>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">This act&apos;s types</p>
        <ul className="divide-y rounded-md border">
          {actTypes.map((t) => (
            <li key={t.id} className="flex items-center justify-between p-2">
              <span>{t.name}</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => remove(t.id)}
                aria-label={`Delete ${t.name}`}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </li>
          ))}
          {actTypes.length === 0 && (
            <li className="p-2 text-sm text-muted-foreground">
              No act-specific types.
            </li>
          )}
        </ul>
        <form onSubmit={add} className="flex gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New act-specific event type"
            maxLength={100}
          />
          <Button type="submit" disabled={pending}>
            <Plus /> Add
          </Button>
        </form>
      </div>
    </div>
  );
}
