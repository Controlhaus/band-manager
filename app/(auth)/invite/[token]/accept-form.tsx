"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { signIn } from "@/lib/auth-client";
import { acceptInvitation } from "@/app/actions/invitations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";

type Props = {
  token: string;
  email: string;
  hasAccount: boolean;
  signedInEmail: string | null;
};

export function AcceptInviteForm({
  token,
  email,
  hasAccount,
  signedInEmail,
}: Props) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  async function finish() {
    const res = await acceptInvitation({ token });
    if (!res.ok) {
      toast({ variant: "destructive", title: "Could not accept", description: res.error });
      return false;
    }
    toast({ title: "Invitation accepted" });
    router.push("/acts");
    router.refresh();
    return true;
  }

  // Case 1: existing account, already signed in with the right email.
  if (hasAccount && signedInEmail === email) {
    return (
      <Button
        className="w-full"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          await finish();
          setPending(false);
        }}
      >
        {pending ? "Accepting…" : "Accept invitation"}
      </Button>
    );
  }

  // Case 2: existing account, not signed in (or wrong account) → sign in.
  if (hasAccount) {
    return (
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const password = String(
            new FormData(e.currentTarget).get("password") ?? "",
          );
          setPending(true);
          const { error } = await signIn.email({ email, password });
          if (error) {
            setPending(false);
            toast({
              variant: "destructive",
              title: "Sign in failed",
              description: error.message ?? "Check your password.",
            });
            return;
          }
          await finish();
          setPending(false);
        }}
      >
        <p className="text-sm text-muted-foreground">
          Sign in as {email} to accept.
        </p>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input id="password" name="password" type="password" required />
        </div>
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "Accepting…" : "Sign in & accept"}
        </Button>
      </form>
    );
  }

  // Case 3: new account → set name + password.
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        const name = String(form.get("name") ?? "").trim();
        const password = String(form.get("password") ?? "");
        const confirm = String(form.get("confirm") ?? "");
        if (password.length < 10) {
          toast({ variant: "destructive", title: "Password too short", description: "Use at least 10 characters." });
          return;
        }
        if (password !== confirm) {
          toast({ variant: "destructive", title: "Passwords don't match" });
          return;
        }
        setPending(true);
        const res = await acceptInvitation({ token, name, password });
        setPending(false);
        if (!res.ok) {
          toast({ variant: "destructive", title: "Could not accept", description: res.error });
          return;
        }
        toast({ title: "Welcome!", description: "Your account is ready." });
        router.push("/acts");
        router.refresh();
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="name">Your name</Label>
        <Input id="name" name="name" required maxLength={120} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={10}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm">Confirm password</Label>
        <Input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          minLength={10}
        />
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Creating account…" : "Create account & accept"}
      </Button>
    </form>
  );
}
