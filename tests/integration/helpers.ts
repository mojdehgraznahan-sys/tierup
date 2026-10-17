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
