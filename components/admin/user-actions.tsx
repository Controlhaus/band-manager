"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import {
  updateUserGlobalRole,
  setUserActive,
  deleteUser,
} from "@/app/actions/admin";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/hooks/use-toast";
import type { GlobalRole } from "@prisma/client";

export function UserActions({
  userId,
  isSelf,
  globalRole,
  isActive,
}: {
  userId: string;
  isSelf: boolean;
  globalRole: GlobalRole;
  isActive: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) {
    setPending(true);
    const res = await fn();
    setPending(false);
    if (!res.ok) {
      toast({ variant: "destructive", title: "Action failed", description: res.error });
      return;
    }
    toast({ title: ok });
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" disabled={pending}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={() =>
            run(
              () =>
                updateUserGlobalRole({
                  userId,
                  globalRole: globalRole === "SUPERADMIN" ? "USER" : "SUPERADMIN",
                }),
              "Global role updated",
            )
          }
        >
          {globalRole === "SUPERADMIN" ? "Demote to user" : "Promote to superadmin"}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() =>
            run(
              () => setUserActive({ userId, isActive: !isActive }),
              isActive ? "User deactivated" : "User activated",
            )
          }
        >
          {isActive ? "Deactivate" : "Activate"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive"
          disabled={isSelf}
          onClick={() => {
            if (!confirm("Delete this user permanently?")) return;
            run(() => deleteUser({ userId }), "User deleted");
          }}
        >
          Delete user
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
