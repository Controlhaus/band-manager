import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { normalizeEmail } from "@/lib/normalize";
import { hashInviteToken, parseGrants } from "@/lib/invitations";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AcceptInviteForm } from "./accept-form";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const invite = await prisma.invitation.findUnique({
    where: { tokenHash: hashInviteToken(token) },
  });

  const invalid = !invite || invite.acceptedAt || invite.expiresAt < new Date();

  if (invalid) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Invitation unavailable</CardTitle>
          <CardDescription>
            This invitation is invalid, already used, or has expired.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline" className="w-full">
            <Link href="/login">Go to sign in</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const email = normalizeEmail(invite.email);
  const grants = parseGrants(invite.grants);
  const acts = await prisma.act.findMany({
    where: { id: { in: grants.map((g) => g.actId) } },
    select: { id: true, name: true },
  });
  const actNames = grants
    .map((g) => ({
      name: acts.find((a) => a.id === g.actId)?.name,
      role: g.role,
    }))
    .filter((x): x is { name: string; role: (typeof grants)[number]["role"] } =>
      Boolean(x.name),
    );

  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  const session = await getSession();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Accept your invitation</CardTitle>
        <CardDescription>
          Invitation for <span className="font-medium">{email}</span>.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {actNames.length > 0 && (
          <div className="rounded-md border bg-muted/40 p-3 text-sm">
            <p className="mb-1 font-medium">You&apos;ll join:</p>
            <ul className="space-y-0.5">
              {actNames.map((a, i) => (
                <li key={i} className="flex justify-between">
                  <span>{a.name}</span>
                  <span className="text-muted-foreground">{a.role}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <AcceptInviteForm
          token={token}
          email={email}
          hasAccount={Boolean(existingUser)}
          signedInEmail={session ? normalizeEmail(session.email) : null}
        />
      </CardContent>
    </Card>
  );
}
