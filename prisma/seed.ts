/**
 * Idempotent seed script (§12). Safe to run repeatedly (§15.6):
 *  - bootstrap superadmin from ADMIN_EMAIL / ADMIN_PASSWORD (if no user exists)
 *  - 3 attendance statuses (upsert by key)
 *  - 6 global event types (upsert by name where actId is null)
 *  - optional demo act when SEED_DEMO=true (guarded by demo slug existence)
 */
import { prisma } from "../lib/prisma";
import { auth, createCredentialUser } from "../lib/auth";
import { env } from "../lib/env";
import { ATTENDANCE_STATUSES, DEFAULT_EVENT_TYPES } from "../lib/constants";
import { normalizeEmail } from "../lib/normalize";

async function seedAttendanceStatuses() {
  for (const s of ATTENDANCE_STATUSES) {
    await prisma.attendanceStatus.upsert({
      where: { key: s.key },
      create: s,
      update: { label: s.label, color: s.color, sortOrder: s.sortOrder },
    });
  }
  console.log(`✓ attendance statuses (${ATTENDANCE_STATUSES.length})`);
}

async function seedGlobalEventTypes() {
  let order = 1;
  for (const name of DEFAULT_EVENT_TYPES) {
    const existing = await prisma.eventType.findFirst({
      where: { actId: null, name },
    });
    if (existing) {
      await prisma.eventType.update({
        where: { id: existing.id },
        data: { sortOrder: order },
      });
    } else {
      await prisma.eventType.create({
        data: { actId: null, name, sortOrder: order },
      });
    }
    order++;
  }
  console.log(`✓ global event types (${DEFAULT_EVENT_TYPES.length})`);
}

async function seedSuperadmin() {
  const userCount = await prisma.user.count();
  if (userCount > 0) {
    console.log("• users already exist; skipping bootstrap superadmin");
    return;
  }
  if (!env.admin.email || !env.admin.password) {
    console.log(
      "• ADMIN_EMAIL / ADMIN_PASSWORD not set; skipping bootstrap superadmin",
    );
    return;
  }
  const email = normalizeEmail(env.admin.email);
  await createCredentialUser(prisma, {
    email,
    name: "Administrator",
    password: env.admin.password,
    globalRole: "SUPERADMIN",
    emailVerified: true,
  });
  console.log(`✓ bootstrap superadmin created: ${email}`);
}

async function seedDemo() {
  if (!env.seedDemo) return;
  const demoSlug = "demo-band";
  const existing = await prisma.act.findUnique({ where: { slug: demoSlug } });
  if (existing) {
    console.log("• demo act already exists; skipping demo seed");
    return;
  }

  const superadmin = await prisma.user.findFirst({
    where: { globalRole: "SUPERADMIN" },
  });

  const act = await prisma.act.create({
    data: {
      name: "Demo Band",
      slug: demoSlug,
      description: "A demo act seeded for exploration.",
      timezone: env.defaultTz,
      createdById: superadmin?.id ?? null,
    },
  });

  // Two demo members (credential users) + optional superadmin membership.
  const members = [
    { email: "singer@demo.local", name: "Demo Singer", role: "ADMIN" as const },
    { email: "bass@demo.local", name: "Demo Bassist", role: "MEMBER" as const },
    { email: "guest@demo.local", name: "Demo Guest", role: "READONLY" as const },
  ];
  for (const m of members) {
    const user = await createCredentialUser(prisma, {
      email: normalizeEmail(m.email),
      name: m.name,
      password: "demo-password-123",
      emailVerified: true,
    });
    await prisma.actMembership.create({
      data: { actId: act.id, userId: user.id, role: m.role },
    });
  }
  if (superadmin) {
    await prisma.actMembership.create({
      data: { actId: act.id, userId: superadmin.id, role: "ADMIN" },
    });
  }

  const styles = ["Rock", "Pop", "Jazz", "Funk", "Soul", "Folk"];
  const statuses = [
    "IDEA",
    "REHEARSING",
    "REHEARSED",
    "PERFORMED",
  ] as const;
  for (let i = 1; i <= 10; i++) {
    await prisma.song.create({
      data: {
        actId: act.id,
        title: `Demo Song ${i}`,
        artist: `Artist ${i}`,
        style: styles[i % styles.length],
        key: ["C", "G", "D", "A", "E"][i % 5],
        tempoBpm: 90 + i * 3,
        durationSec: 180 + i * 5,
        status: statuses[i % statuses.length],
        links: {
          create: [
            {
              platform: "SPOTIFY",
              url: `https://open.spotify.com/track/demo${i}`,
              label: "Spotify",
            },
          ],
        },
      },
    });
  }

  const eventType = await prisma.eventType.findFirst({
    where: { name: "Wedding" },
  });
  const songs = await prisma.song.findMany({
    where: { actId: act.id },
    take: 4,
    orderBy: { title: "asc" },
  });

  const now = new Date();
  await prisma.calendarEntry.create({
    data: {
      actId: act.id,
      kind: "REHEARSAL",
      title: "Weekly rehearsal",
      startsAt: new Date(now.getTime() + 3 * 24 * 3600 * 1000),
      locationName: "Rehearsal room",
      createdById: superadmin?.id ?? null,
    },
  });

  await prisma.calendarEntry.create({
    data: {
      actId: act.id,
      kind: "EVENT",
      eventTypeId: eventType?.id ?? null,
      title: "Anderson Wedding",
      startsAt: new Date(now.getTime() + 14 * 24 * 3600 * 1000),
      locationName: "Grand Hall",
      locationAddress: "1 Celebration Ave",
      createdById: superadmin?.id ?? null,
      setlists: {
        create: [
          {
            name: "Set 1",
            sortOrder: 1,
            items: {
              create: songs.slice(0, 2).map((s, idx) => ({
                position: idx + 1,
                songId: s.id,
              })),
            },
          },
          {
            name: "Set 2",
            sortOrder: 2,
            items: {
              create: songs.slice(2, 4).map((s, idx) => ({
                position: idx + 1,
                songId: s.id,
              })),
            },
          },
        ],
      },
    },
  });

  console.log("✓ demo act seeded");
}

async function main() {
  await seedAttendanceStatuses();
  await seedGlobalEventTypes();
  await seedSuperadmin();
  await seedDemo();
  // Ensure any better-auth background context is settled before exit.
  await auth.$context;
}

main()
  .then(async () => {
    await prisma.$disconnect();
    console.log("Seed complete.");
  })
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
