import { PrismaClient, type TimeBlock } from "@prisma/client";

export const db = new PrismaClient();

/** Empties every table except migrations. */
export async function resetDb() {
  const tables = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} CASCADE`);
}

const SLOTS: { label: string; startMinute: number; block: TimeBlock }[] = [
  { label: "Lunch", startMinute: 730, block: "lunch" },
  { label: "3:30 pm", startMinute: 930, block: "after_school" },
  { label: "4:30 pm", startMinute: 990, block: "after_school" },
  { label: "7:00 pm", startMinute: 1140, block: "evening" },
];

export async function makeSchool(name = "Test Academy", domains: string[] = ["test-academy.test"]) {
  return db.school.create({
    data: {
      name,
      state: "DC",
      staffEmailDomains: domains,
      approvedSpaces: ["Library"],
      slots: { create: SLOTS.map((s, i) => ({ ...s, sortOrder: i })) },
    },
  });
}

export async function makeSubjects(...names: string[]) {
  return Promise.all(names.map((name, i) => db.subject.create({ data: { name, group: "Math", sortOrder: i } })));
}

/** A freshly signed-in account that hasn't onboarded yet. */
export async function makeAccount(email: string) {
  return db.user.create({ data: { email } });
}

type Person = {
  email: string;
  name?: string;
  schoolId: string | null;
  formats?: ("in_person" | "online")[];
  consent?: "approved" | "pending";
  /** [weekday, startMinute] pairs; must match the school's slots. */
  avail?: [number, number][];
};

async function addAvailability(userId: string, schoolId: string | null, avail: [number, number][] = []) {
  if (!schoolId || avail.length === 0) return;
  const slots = await db.schoolSlot.findMany({ where: { schoolId } });
  await db.availabilitySlot.createMany({
    data: avail.map(([weekday, minute]) => ({ userId, weekday, slotId: slots.find((s) => s.startMinute === minute)!.id })),
  });
}

/** An onboarded learner. */
export async function makeLearner(p: Person) {
  const u = await db.user.create({
    data: {
      email: p.email,
      name: p.name ?? "Lea Learner",
      roles: ["learner"],
      schoolId: p.schoolId,
      grade: 10,
      formats: p.formats ?? ["in_person", "online"],
      onboardedAt: new Date(),
      consent: { create: { parentEmail: `parent+${p.email}`, token: `t-${p.email}`, status: p.consent ?? "approved" } },
    },
  });
  await addAvailability(u.id, p.schoolId, p.avail);
  return u;
}

/** An onboarded tutor with per-subject approval statuses. */
export async function makeTutor(p: Person & { subjects: Record<string, "approved" | "pending" | "revoked">; paused?: boolean }) {
  const u = await db.user.create({
    data: {
      email: p.email,
      name: p.name ?? "Tia Tutor",
      roles: ["tutor"],
      schoolId: p.schoolId,
      grade: 12,
      formats: p.formats ?? ["in_person", "online"],
      onboardedAt: new Date(),
      consent: { create: { parentEmail: `parent+${p.email}`, token: `t-${p.email}`, status: p.consent ?? "approved" } },
      tutorStatus: { create: { paused: p.paused ?? false } },
      tutorSubjects: { create: Object.entries(p.subjects).map(([subjectId, status]) => ({ subjectId, status })) },
    },
  });
  await addAvailability(u.id, p.schoolId, p.avail);
  return u;
}
