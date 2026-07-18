"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { updateAct } from "@/app/actions/acts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";

export function ActSettingsForm({
  actId,
  name,
  description,
  timezone,
}: {
  actId: string;
  name: string;
  description: string;
  timezone: string;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setPending(true);
    const res = await updateAct({
      actId,
      name: String(form.get("name") ?? ""),
      description: String(form.get("description") ?? "") || undefined,
      timezone: String(form.get("timezone") ?? ""),
    });
    setPending(false);
    if (!res.ok) {
      toast({ variant: "destructive", title: "Could not save", description: res.error });
      return;
    }
    toast({ title: "Settings saved" });
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="max-w-lg space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" defaultValue={name} required maxLength={120} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea id="description" name="description" defaultValue={description} rows={3} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="timezone">Timezone (IANA)</Label>
        <Input id="timezone" name="timezone" defaultValue={timezone} required />
        <p className="text-xs text-muted-foreground">
          e.g. Europe/Berlin, America/New_York
        </p>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}
