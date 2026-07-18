"use client";
import * as React from "react";
import Link from "next/link";
import { forgetPassword } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";

export function ForgotPasswordForm() {
  const [pending, setPending] = React.useState(false);
  const [sent, setSent] = React.useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get("email") ?? "");
    setPending(true);
    const { error } = await forgetPassword({
      email,
      redirectTo: "/reset-password",
    });
    setPending(false);
    if (error) {
      toast({
        variant: "destructive",
        title: "Could not send email",
        description: error.message ?? "Please try again.",
      });
      return;
    }
    // Always show a neutral confirmation (no account enumeration).
    setSent(true);
  }

  if (sent) {
    return (
      <div className="space-y-4 text-sm">
        <p>
          If an account exists for that email, a password reset link is on its
          way.
        </p>
        <Button asChild variant="outline" className="w-full">
          <Link href="/login">Back to sign in</Link>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required />
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Sending…" : "Send reset link"}
      </Button>
      <Button asChild variant="ghost" className="w-full">
        <Link href="/login">Back to sign in</Link>
      </Button>
    </form>
  );
}
