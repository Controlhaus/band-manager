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
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");

  async function finish() {
    let res;
    try {
      res = await acceptInvitation({ token });
    } catch {
      toast({
        variant: "destructive",
        title: "Something went wrong",
        description: "Please refresh the page and try again.",
      });
      return false;
    }
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
        method="post"
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
      method="post"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        const name = String(form.get("name") ?? "").trim();
        if (password.length < 10) {
          toast({ variant: "destructive", title: "Password too short", description: "Use at least 10 characters." });
          return;
        }
        if (password !== confirm) {
          toast({ variant: "destructive", title: "Passwords don't match" });
          return;
        }
        setPending(true);
        let res;
        try {
          res = await acceptInvitation({ token, name, password });
        } catch {
          setPending(false);
          toast({
            variant: "destructive",
            title: "Something went wrong",
            description: "Please refresh the page and try again.",
          });
          return;
        }
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
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <p
          className={
            password.length > 0 && password.length < 10
              ? "text-xs text-destructive"
              : "text-xs text-muted-foreground"
          }
        >
          At least 10 characters.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm">Confirm password</Label>
        <Input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        {confirm.length > 0 && confirm !== password && (
          <p className="text-xs text-destructive">Passwords don&apos;t match.</p>
        )}
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Creating account…" : "Create account & accept"}
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        Not responding? Open this page in Chrome or Safari instead of an
        in-app browser.
      </p>
    </form>
  );
}
