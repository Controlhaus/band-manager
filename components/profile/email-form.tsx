"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { updateEmail } from "@/app/actions/profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";

export function EmailForm({ email }: { email: string }) {
  const router = useRouter();
  const [value, setValue] = React.useState(email);
  const [pending, setPending] = React.useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (value.trim().toLowerCase() === email.toLowerCase()) return;
    setPending(true);
    const res = await updateEmail({ newEmail: value });
    setPending(false);
    if (!res.ok) {
      toast({ variant: "destructive", title: "Could not change email", description: res.error });
      return;
    }
    toast({ title: "Email updated", description: "Use your new email to sign in." });
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex max-w-lg items-end gap-2">
      <div className="flex-1 space-y-2">
        <Label htmlFor="email">Email address</Label>
        <Input
          id="email"
          type="email"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          required
        />
      </div>
      <Button type="submit" disabled={pending || value.trim().toLowerCase() === email.toLowerCase()}>
        {pending ? "Saving…" : "Update"}
      </Button>
    </form>
  );
}
