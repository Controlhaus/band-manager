"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { createInvitation } from "@/app/actions/invitations";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import type { ActRole } from "@prisma/client";

type ActOption = { id: string; name: string };
type Grant = { actId: string; role: ActRole };

export function InviteDialog({ acts }: { acts: ActOption[] }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [grants, setGrants] = React.useState<Grant[]>([]);

  function addGrant() {
    const first = acts.find((a) => !grants.some((g) => g.actId === a.id));
    if (!first) return;
    setGrants((g) => [...g, { actId: first.id, role: "MEMBER" }]);
  }

  async function onSubmit() {
    if (grants.length === 0) {
      toast({ variant: "destructive", title: "Add at least one act grant." });
      return;
    }
    setPending(true);
    const res = await createInvitation({ email, grants });
    setPending(false);
    if (!res.ok) {
      toast({ variant: "destructive", title: "Could not create invitation", description: res.error });
      return;
    }
    toast({
      title: "Invitation created",
      description: res.data?.emailSent
        ? "The invitation email was sent."
        : "Email could not be sent — use Resend.",
    });
    setOpen(false);
    setEmail("");
    setGrants([]);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" disabled={acts.length === 0}>
          <Plus /> Invite
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite a user</DialogTitle>
          <DialogDescription>
            One invitation can grant membership to several acts.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Act grants</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addGrant}
                disabled={grants.length >= acts.length}
              >
                <Plus /> Add
              </Button>
            </div>
            {grants.length === 0 && (
              <p className="text-sm text-muted-foreground">No grants added.</p>
            )}
            {grants.map((g, i) => (
              <div key={i} className="flex items-center gap-2">
                <Select
                  value={g.actId}
                  onValueChange={(v) =>
                    setGrants((prev) =>
                      prev.map((x, xi) => (xi === i ? { ...x, actId: v } : x)),
                    )
                  }
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {acts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={g.role}
                  onValueChange={(v) =>
                    setGrants((prev) =>
                      prev.map((x, xi) =>
                        xi === i ? { ...x, role: v as ActRole } : x,
                      ),
                    )
                  }
                >
                  <SelectTrigger className="w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ADMIN">Admin</SelectItem>
                    <SelectItem value="MEMBER">Member</SelectItem>
                    <SelectItem value="READONLY">Read-only</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    setGrants((prev) => prev.filter((_, xi) => xi !== i))
                  }
                >
                  <X />
                </Button>
              </div>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button onClick={onSubmit} disabled={pending}>
            {pending ? "Creating…" : "Create invitation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
