"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { updateMembershipRole, removeMembership } from "@/app/actions/members";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import type { ActRole, SkillLevel } from "@prisma/client";

export function MemberRow({
  actId,
  userId,
  name,
  email,
  role,
  canManage,
  instruments,
  skillLevel,
  bio,
}: {
  actId: string;
  userId: string;
  name: string;
  email: string;
  role: ActRole;
  canManage: boolean;
  instruments: string[];
  skillLevel: SkillLevel | null;
  bio: string | null;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  async function changeRole(newRole: ActRole) {
    setPending(true);
    const res = await updateMembershipRole({ actId, userId, role: newRole });
    setPending(false);
    if (!res.ok) {
      toast({ variant: "destructive", title: "Could not update role", description: res.error });
      return;
    }
    toast({ title: "Role updated" });
    router.refresh();
  }

  async function remove() {
    if (!confirm(`Remove ${name} from this act?`)) return;
    setPending(true);
    const res = await removeMembership({ actId, userId });
    setPending(false);
    if (!res.ok) {
      toast({ variant: "destructive", title: "Could not remove", description: res.error });
      return;
    }
    toast({ title: "Member removed" });
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="font-medium">{name}</p>
        <p className="truncate text-sm text-muted-foreground">{email}</p>
        <div className="mt-1 flex flex-wrap gap-1">
          {skillLevel && <Badge variant="outline">{skillLevel}</Badge>}
          {instruments.map((i) => (
            <Badge key={i} variant="secondary">
              {i}
            </Badge>
          ))}
        </div>
        {bio && <p className="mt-1 text-sm text-muted-foreground">{bio}</p>}
      </div>
      <div className="flex items-center gap-2">
        {canManage ? (
          <>
            <Select
              value={role}
              onValueChange={(v) => changeRole(v as ActRole)}
              disabled={pending}
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
              variant="ghost"
              size="sm"
              onClick={remove}
              disabled={pending}
            >
              Remove
            </Button>
          </>
        ) : (
          <Badge>{role}</Badge>
        )}
      </div>
    </div>
  );
}
