import "server-only";
import { db } from "@/server/db";
import { demoSchoolsEnabled } from "@/server/demo";

const STATE_LABEL = { DC: "Washington, DC", MD: "Maryland", VA: "Virginia" } as const;

export type SchoolOption = { id: string; name: string; hasStaffDomains: boolean; staffDomain?: string };
export type SchoolGroup = { label: string; schools: SchoolOption[] };

/** Dropdown groups: DC / Maryland / Virginia, plus demo schools outside production. */
export async function schoolGroups(): Promise<SchoolGroup[]> {
  const schools = await db.school.findMany({ orderBy: { name: "asc" } });
  const option = (s: (typeof schools)[number]): SchoolOption => ({
    id: s.id,
    name: s.name,
    hasStaffDomains: s.staffEmailDomains.length > 0,
    staffDomain: s.staffEmailDomains[0],
  });
  const groups: SchoolGroup[] = (["DC", "MD", "VA"] as const).map((state) => ({
    label: STATE_LABEL[state],
    schools: schools.filter((s) => s.state === state && !s.isDemo).map(option),
  }));
  if (demoSchoolsEnabled()) {
    groups.push({ label: "Demo schools", schools: schools.filter((s) => s.isDemo).map(option) });
  }
  return groups;
}

export type SubjectGroup = { name: string; subjects: { id: string; name: string }[] };

/** The course catalog grouped as in onboarding (English, Math, …), excluding custom courses. */
export async function subjectGroups(): Promise<SubjectGroup[]> {
  const subjects = await db.subject.findMany({ where: { isCustom: false }, orderBy: [{ sortOrder: "asc" }] });
  const order: string[] = [];
  const byGroup = new Map<string, { id: string; name: string }[]>();
  for (const s of subjects) {
    if (!byGroup.has(s.group)) {
      byGroup.set(s.group, []);
      order.push(s.group);
    }
    byGroup.get(s.group)!.push({ id: s.id, name: s.name });
  }
  const GROUP_ORDER = ["English", "Math", "Science", "Social Studies", "World Languages", "Arts", "Computer Science", "Business & Electives"];
  order.sort((a, b) => GROUP_ORDER.indexOf(a) - GROUP_ORDER.indexOf(b));
  return order.map((name) => ({ name, subjects: byGroup.get(name)! }));
}
