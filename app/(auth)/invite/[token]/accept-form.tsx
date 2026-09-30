import Link from "next/link";
import {
  acceptInviteSignedInAction,
  signInAndAcceptAction,
  createAccountAndAcceptAction,
} from "@/app/actions/invitations";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "./submit-button";

type Props = {
  token: string;
  email: string;
  hasAccount: boolean;
  signedInEmail: string | null;
};

/**
 * Server-rendered accept forms bound to server actions, so accepting works
 * without client JS (in-app email browsers). Errors are rendered by the page
 * from the ?error= query param.
 */
export function AcceptInviteForm({
  token,
  email,
  hasAccount,
  signedInEmail,
}: Props) {
  // Case 1: existing account, already signed in with the right email.
  if (hasAccount && signedInEmail === email) {
    return (
      <form action={acceptInviteSignedInAction}>
        <input type="hidden" name="token" value={token} />
        <SubmitButton pendingLabel="Accepting…">Accept invitation</SubmitButton>
      </form>
    );
  }

  // Case 2: existing account, not signed in (or wrong account) → sign in.
  if (hasAccount) {
    return (
      <form action={signInAndAcceptAction} className="space-y-4">
        <input type="hidden" name="token" value={token} />
        <p className="text-sm text-muted-foreground">
          Sign in as {email} to accept.
        </p>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>
        <SubmitButton pendingLabel="Accepting…">Sign in &amp; accept</SubmitButton>
        <p className="text-center text-sm">
          <Link
            href={`/forgot-password?email=${encodeURIComponent(email)}`}
            className="text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            Forgot password?
          </Link>
        </p>
        <p className="text-center text-xs text-muted-foreground">
          After resetting your password, open this invitation link again to
          accept.
        </p>
      </form>
    );
  }

  // Case 3: new account → set name + password.
  return (
    <form action={createAccountAndAcceptAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />
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
        <p className="text-xs text-muted-foreground">At least 10 characters.</p>
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
      <SubmitButton pendingLabel="Creating account…">
        Create account &amp; accept
      </SubmitButton>
    </form>
  );
}
