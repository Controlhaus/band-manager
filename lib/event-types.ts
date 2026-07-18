import { prisma } from "@/lib/prisma";

/**
 * Event type resolution (§14.8 + per-act suppression of global types).
 * The picker shows global types not disabled for the act, plus this act's own
 * types, act rows first.
 */

export type ActEventType = { id: string; name: string; global: boolean };

/** Event types available for entries in an act (global-not-disabled + act's own). */
export async function getActEventTypes(actId: string): Promise<ActEventType[]> {
  const [types, disabled] = await Promise.all([
    prisma.eventType.findMany({
      where: { OR: [{ actId: null }, { actId }] },
      orderBy: [{ actId: "asc" }, { sortOrder: "asc" }],
    }),
    prisma.actDisabledEventType.findMany({
      where: { actId },
      select: { eventTypeId: true },
    }),
  ]);
  const disabledSet = new Set(disabled.map((d) => d.eventTypeId));
  return types
    .filter((t) => !(t.actId === null && disabledSet.has(t.id)))
    // Act-specific types first, then global.
    .sort((a, b) => Number(a.actId === null) - Number(b.actId === null))
    .map((t) => ({ id: t.id, name: t.name, global: t.actId === null }));
}

export type SettingsEventTypes = {
  global: { id: string; name: string; enabled: boolean }[];
  act: { id: string; name: string }[];
};

/** Full event-type list for the settings manager, with per-act enabled flags. */
export async function getSettingsEventTypes(
  actId: string,
): Promise<SettingsEventTypes> {
  const [types, disabled] = await Promise.all([
    prisma.eventType.findMany({
      where: { OR: [{ actId: null }, { actId }] },
      orderBy: [{ actId: "asc" }, { sortOrder: "asc" }],
    }),
    prisma.actDisabledEventType.findMany({
      where: { actId },
      select: { eventTypeId: true },
    }),
  ]);
  const disabledSet = new Set(disabled.map((d) => d.eventTypeId));
  return {
    global: types
      .filter((t) => t.actId === null)
      .map((t) => ({ id: t.id, name: t.name, enabled: !disabledSet.has(t.id) })),
    act: types
      .filter((t) => t.actId === actId)
      .map((t) => ({ id: t.id, name: t.name })),
  };
}
