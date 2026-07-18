import { notFound, redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { loadActForUser } from "@/lib/act-access";
import { can } from "@/lib/roles";
import { getSettingsEventTypes } from "@/lib/event-types";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ActSettingsForm } from "@/components/settings/act-settings-form";
import { EventTypesManager } from "@/components/settings/event-types-manager";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const user = await requireSession();
  const act = await loadActForUser(user, slug);
  if (!act) notFound();
  if (!can(act.role, "act:edit")) redirect(`/acts/${slug}`);

  const eventTypes = await getSettingsEventTypes(act.id);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Act settings</h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Details</CardTitle>
          <CardDescription>
            The URL slug (<span className="font-mono">{act.slug}</span>) is fixed
            once an act is created.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ActSettingsForm
            actId={act.id}
            name={act.name}
            description={act.description ?? ""}
            timezone={act.timezone}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Event types</CardTitle>
          <CardDescription>
            Turn global types off for this act to hide unused ones from the
            picker, and add types specific to this act.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EventTypesManager
            actId={act.id}
            global={eventTypes.global}
            actTypes={eventTypes.act}
          />
        </CardContent>
      </Card>
    </div>
  );
}
