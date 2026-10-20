// The production catalog: DMV schools (with confirmed staff domains), default bell-time slots,
// and the course list. Safe to run repeatedly against a live database: it only adds what's
// missing and never deletes or overwrites data people have changed.
import type { PrismaClient } from "@prisma/client";
import { DEFAULT_SLOTS, DEFAULT_SPACES } from "../../src/lib/school-defaults";
import { DMV_SCHOOLS } from "./schools";
import { SUBJECT_GROUPS } from "./subjects";

export { DEFAULT_SLOTS, DEFAULT_SPACES };

export async function seedCatalog(db: PrismaClient) {
  let schoolsAdded = 0;
  let domainsAdded = 0;
  for (const s of DMV_SCHOOLS) {
    const existing = await db.school.findUnique({ where: { name: s.name } });
    if (!existing) {
      await db.school.create({
        data: {
          name: s.name,
          state: s.state,
          staffEmailDomains: s.staffEmailDomains ?? [],
          approvedSpaces: DEFAULT_SPACES,
          slots: { create: DEFAULT_SLOTS.map((slot, i) => ({ ...slot, sortOrder: i })) },
        },
      });
      schoolsAdded++;
      continue;
    }
    // Add newly confirmed domains; never remove ones already there.
    const missing = (s.staffEmailDomains ?? []).filter((d) => !existing.staffEmailDomains.includes(d));
    if (missing.length) {
      await db.school.update({ where: { id: existing.id }, data: { staffEmailDomains: [...existing.staffEmailDomains, ...missing] } });
      domainsAdded += missing.length;
    }
    if ((await db.schoolSlot.count({ where: { schoolId: existing.id } })) === 0) {
      await db.schoolSlot.createMany({ data: DEFAULT_SLOTS.map((slot, i) => ({ ...slot, schoolId: existing.id, sortOrder: i })) });
    }
  }

  let subjectsAdded = 0;
  for (const [group, courses] of SUBJECT_GROUPS) {
    for (const [i, name] of courses.entries()) {
      const existing = await db.subject.findFirst({ where: { name, group, isCustom: false } });
      if (!existing) {
        await db.subject.create({ data: { name, group, sortOrder: i } });
        subjectsAdded++;
      }
    }
  }
  return { schoolsAdded, domainsAdded, subjectsAdded };
}
