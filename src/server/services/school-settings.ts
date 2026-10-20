import "server-only";
import { z } from "zod";
import { Prisma, type Role, type TimeBlock } from "@prisma/client";
import { db } from "@/server/db";
import { UserError } from "@/server/errors";
import { displayName } from "@/lib/names";
import { minuteLabel } from "@/lib/time";

// Moderation › School: staff configure their own school (spaces, bell times, goal, tutor caps).

type Staff = { id: string; roles: Role[]; schoolId: string | null };

function schoolOf(staff: Staff): string {
  if (!staff.roles.includes("staff") || !staff.schoolId) throw new UserError("Staff only.");
  return staff.schoolId;
}

export const BLOCKS: { value: TimeBlock; label: string }[] = [
  { value: "before_school", label: "Before school" },
  { value: "lunch", label: "Lunch" },
  { value: "after_school", label: "After school" },
  { value: "evening", label: "Evening" },
];

export async function schoolSettings(staff: Staff) {
  const schoolId = schoolOf(staff);
  const school = await db.school.findUniqueOrThrow({
    where: { id: schoolId },
    include: {
      slots: { orderBy: { startMinute: "asc" }, include: { _count: { select: { availability: true } } } },
      users: {
        where: { roles: { has: "tutor" }, onboardedAt: { not: null } },
        include: { tutorStatus: true },
        orderBy: { name: "asc" },
      },
    },
  });
  return {
    name: school.name,
    goal: school.serviceHourGoal,
    spaces: school.approvedSpaces,
    staffDomains: school.staffEmailDomains,
    slots: school.slots
      .filter((s) => s.block !== "weekend")
      .map((s) => ({ id: s.id, label: s.label, time: toHHMM(s.startMinute), timeLabel: minuteLabel(s.startMinute), block: s.block, inUse: s._count.availability })),
    tutors: school.users.map((u) => ({ id: u.id, name: displayName(u.name), cap: u.tutorStatus?.weeklyCap ?? 3, paused: !!u.tutorStatus?.paused })),
  };
}

const toHHMM = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const fromHHMM = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a time like 15:30")
  .transform((t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3)))
  .refine((m) => m >= 6 * 60 && m <= 21 * 60, "Pick a time between 6:00 and 21:00");

export async function setServiceHourGoal(staff: Staff, goal: number) {
  const value = z.number().int().min(1, "At least 1 hour").max(500).parse(goal);
  await db.school.update({ where: { id: schoolOf(staff) }, data: { serviceHourGoal: value } });
  return { toast: `Service-hour goal set to ${value}` };
}

export async function setSpaces(staff: Staff, spaces: string[]) {
  const list = z
    .array(z.string().trim().min(2, "Space names need 2–60 characters").max(60))
    .min(1, "Keep at least one approved space")
    .max(30)
    .parse(spaces);
  const unique = [...new Map(list.map((s) => [s.toLowerCase(), s])).values()];
  await db.school.update({ where: { id: schoolOf(staff) }, data: { approvedSpaces: unique } });
  return { toast: "Approved spaces saved" };
}

export const slotSchema = z.object({
  label: z.string().trim().min(1, "Give the slot a label").max(20),
  time: fromHHMM,
  block: z.enum(["before_school", "lunch", "after_school", "evening"]),
});

/** Adds a bell-time slot (a row on the booking and availability grids). */
export async function addSlot(staff: Staff, raw: z.input<typeof slotSchema>) {
  const schoolId = schoolOf(staff);
  const input = slotSchema.parse(raw);
  const count = await db.schoolSlot.count({ where: { schoolId } });
  if (count >= 10) throw new UserError("A school can have up to 10 time slots.");
  try {
    await db.schoolSlot.create({ data: { schoolId, label: input.label, startMinute: input.time, block: input.block, sortOrder: count } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") throw new UserError("There's already a slot at that time.");
    throw err;
  }
  return { toast: `${input.label} added` };
}

/** Renames or re-labels a slot. Booked sessions keep their times; free times move with the slot. */
export async function updateSlot(staff: Staff, slotId: string, raw: z.input<typeof slotSchema>) {
  const schoolId = schoolOf(staff);
  const input = slotSchema.parse(raw);
  try {
    const { count } = await db.schoolSlot.updateMany({
      where: { id: slotId, schoolId },
      data: { label: input.label, startMinute: input.time, block: input.block },
    });
    if (count === 0) throw new UserError("That slot isn't at your school.");
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") throw new UserError("There's already a slot at that time.");
    throw err;
  }
  return { toast: "Slot saved" };
}

/** Removes a slot and the free times students had marked in it. Booked sessions aren't affected. */
export async function removeSlot(staff: Staff, slotId: string) {
  const schoolId = schoolOf(staff);
  if ((await db.schoolSlot.count({ where: { schoolId, block: { not: "weekend" } } })) <= 1) {
    throw new UserError("Keep at least one time slot.");
  }
  const { count } = await db.schoolSlot.deleteMany({ where: { id: slotId, schoolId } });
  if (count === 0) throw new UserError("That slot isn't at your school.");
  return { toast: "Slot removed" };
}

/** Max sessions per week for one tutor at the school. */
export async function setTutorCap(staff: Staff, tutorId: string, cap: number) {
  const schoolId = schoolOf(staff);
  const value = z.number().int().min(0, "0 or more").max(15).parse(cap);
  const tutor = await db.user.findFirst({ where: { id: tutorId, schoolId, roles: { has: "tutor" } } });
  if (!tutor) throw new UserError("That tutor isn't at your school.");
  await db.tutorStatus.upsert({ where: { tutorId }, create: { tutorId, weeklyCap: value }, update: { weeklyCap: value } });
  return { toast: `${displayName(tutor.name)}: up to ${value} session${value === 1 ? "" : "s"} a week` };
}
