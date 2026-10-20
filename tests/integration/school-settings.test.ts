import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/email/send", () => ({ sendEmail: async () => {}, sendEmailSafely: async () => {} }));

import * as ss from "@/server/services/school-settings";
import { tutorHours } from "@/server/services/hours";
import { db, makeLearner, makeSchool, makeSubjects, makeTutor, resetDb } from "./helpers";

beforeEach(resetDb);
afterAll(() => db.$disconnect());

async function world() {
  const home = await makeSchool("Home High", ["home.test"]);
  const away = await makeSchool("Away High", ["away.test"]);
  const [algebra] = await makeSubjects("Algebra II");
  const staff = await db.user.create({ data: { email: "ms.s@home.test", name: "Ms. Staff", roles: ["staff"], schoolId: home.id, onboardedAt: new Date() } });
  const outsider = await db.user.create({ data: { email: "mr.o@away.test", name: "Mr. Other", roles: ["staff"], schoolId: away.id, onboardedAt: new Date() } });
  const tutor = await makeTutor({ email: "tom@home.test", name: "Tom Tutor", schoolId: home.id, subjects: { [algebra!.id]: "approved" }, avail: [[2, 730]] });
  const learner = await makeLearner({ email: "lea@home.test", schoolId: home.id, avail: [[2, 730]] });
  return { home, staff, outsider, tutor, learner };
}

describe("school settings", () => {
  it("shows the school's own settings and tutors", async () => {
    const w = await world();
    const v = await ss.schoolSettings(w.staff);
    expect(v).toMatchObject({ name: "Home High", goal: 40, spaces: ["Library"], staffDomains: ["home.test"] });
    expect(v.slots.map((s) => [s.label, s.time])).toEqual([["Lunch", "12:10"], ["3:30 pm", "15:30"], ["4:30 pm", "16:30"], ["7:00 pm", "19:00"]]);
    expect(v.slots.find((s) => s.label === "Lunch")!.inUse).toBe(2);
    expect(v.tutors).toEqual([{ id: w.tutor.id, name: "Tom T.", cap: 3, paused: false }]);
    await expect(ss.schoolSettings({ ...w.learner, roles: ["learner"] })).rejects.toThrow(/Staff only/);
  });

  it("sets the goal (shown on tutor dashboards) and approved spaces", async () => {
    const w = await world();
    await ss.setServiceHourGoal(w.staff, 25);
    expect((await tutorHours(w.tutor.id)).goal).toBe(25);
    await expect(ss.setServiceHourGoal(w.staff, 0)).rejects.toThrow();

    await ss.setSpaces(w.staff, ["Library", " Room 112 ", "library"]);
    expect((await db.school.findUniqueOrThrow({ where: { id: w.home.id } })).approvedSpaces).toEqual(["library", "Room 112"]);
    await expect(ss.setSpaces(w.staff, [])).rejects.toThrow(/at least one/);
  });

  it("adds, edits and removes slots; removing drops students' free times in it", async () => {
    const w = await world();
    await ss.addSlot(w.staff, { label: "Advisory", time: "09:45", block: "before_school" });
    await expect(ss.addSlot(w.staff, { label: "Dup", time: "09:45", block: "before_school" })).rejects.toThrow(/already a slot/);
    await expect(ss.addSlot(w.staff, { label: "Late", time: "23:00", block: "evening" })).rejects.toThrow();

    const lunch = (await ss.schoolSettings(w.staff)).slots.find((s) => s.label === "Lunch")!;
    await ss.updateSlot(w.staff, lunch.id, { label: "Lunch B", time: "12:40", block: "lunch" });
    expect(await db.schoolSlot.findUniqueOrThrow({ where: { id: lunch.id } })).toMatchObject({ label: "Lunch B", startMinute: 760 });
    expect(await db.availabilitySlot.count({ where: { slotId: lunch.id } })).toBe(2); // free times moved with it

    await expect(ss.removeSlot(w.outsider, lunch.id)).rejects.toThrow(/isn't at your school/);
    await ss.removeSlot(w.staff, lunch.id);
    expect(await db.availabilitySlot.count({ where: { slotId: lunch.id } })).toBe(0);
  });

  it("keeps at least one slot", async () => {
    const w = await world();
    const slots = (await ss.schoolSettings(w.staff)).slots;
    for (const s of slots.slice(1)) await ss.removeSlot(w.staff, s.id);
    await expect(ss.removeSlot(w.staff, slots[0]!.id)).rejects.toThrow(/at least one/);
  });

  it("sets a tutor's weekly cap, only for tutors at the school", async () => {
    const w = await world();
    expect((await ss.setTutorCap(w.staff, w.tutor.id, 1)).toast).toBe("Tom T.: up to 1 session a week");
    expect((await db.tutorStatus.findUniqueOrThrow({ where: { tutorId: w.tutor.id } })).weeklyCap).toBe(1);
    await expect(ss.setTutorCap(w.outsider, w.tutor.id, 5)).rejects.toThrow(/isn't at your school/);
  });
});
