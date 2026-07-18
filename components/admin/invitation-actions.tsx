"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { resendInvitation, revokeInvitation } from "@/app/actions/invitations";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";

export function InvitationActions({ invitationId }: { invitationId: string }) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  async function onResend() {
    setPending(true);
    const res = await resendInvitation(invitationId);
    setPending(false);
    if (!res.ok) {
      toast({ variant: "destructive", title: "Could not resend", description: res.error });
      return;
    }
    toast({
      title: "Invitation resent",
      description: res.data?.emailSent ? undefined : "Email could not be sent.",
    });
    router.refresh();
  }

  async function onRevoke() {
    if (!confirm("Revoke this invitation?")) return;
    setPending(true);
    const res = await revokeInvitation(invitationId);
    setPending(false);
    if (!res.ok) {
      toast({ variant: "destructive", title: "Could not revoke", description: res.error });
      return;
    }
    toast({ title: "Invitation revoked" });
    router.refresh();
  }

  return (
    <div className="flex justify-end gap-1">
      <Button variant="outline" size="sm" onClick={onResend} disabled={pending}>
        Resend
      </Button>
      <Button variant="ghost" size="sm" onClick={onRevoke} disabled={pending}>
        Revoke
      </Button>
    </div>
  );
}
