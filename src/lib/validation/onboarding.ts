import { z } from "zod";

// Shared by the onboarding wizard (client-side step checks) and the server action.

export const TIME_BLOCKS = [
  { value: "before_school", label: "Before school" },
  { value: "lunch", label: "Lunch" },
  { value: "after_school", label: "After school" },
  { value: "evening", label: "Evenings" },
  { value: "weekend", label: "Weekends" },
] as const;

export const COURSE_GRADES = ["A+", "A", "A−", "B+", "B"] as const;
export const STUDENT_GRADES = [9, 10, 11, 12] as const;

/** Catalog subjects are keyed by id; custom ("Other") courses by `custom:<name>`. */
export const customKey = (name: string) => `custom:${name}`;
export const isCustomKey = (key: string) => key.startsWith("custom:");
export const customName = (key: string) => key.slice("custom:".length);

const email = z.string().trim().toLowerCase().email("Enter a valid email address");
export const emailDomain = (address: string) => address.trim().toLowerCase().split("@")[1] ?? "";

export const onboardingSchema = z
  .object({
    role: z.enum(["learner", "tutor"]),
    firstName: z.string().trim().min(1, "Enter your first name").max(40),
    lastName: z.string().trim().min(1, "Enter your last name").max(40),
    school: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("listed"), schoolId: z.string().min(1, "Pick your school") }),
      z.object({ kind: z.literal("unlisted"), schoolName: z.string().trim().min(2, "Tell us your school's name").max(120) }),
    ]),
    grade: z.number().int().min(9).max(12),
    schoolEmail: z.union([email, z.literal("")]).optional(),
    subjectKeys: z.array(z.string().min(1)).min(1, "Pick at least one subject").max(40),
    endorsements: z
      .record(
        z.string(),
        z.object({ teacherEmail: email, courseGrade: z.enum(COURSE_GRADES).optional() }),
      )
      .default({}),
    blocks: z
      .array(z.enum(["before_school", "lunch", "after_school", "evening", "weekend"]))
      .min(1, "Pick at least one time you're usually free"),
    format: z.enum(["in_person", "online", "both"]),
    // Only used while parent consent is switched on (PARENT_CONSENT=true).
    parentEmail: z.union([email, z.literal("")]).optional(),
    sendSummaries: z.boolean().default(true),
  })
  .superRefine((v, ctx) => {
    for (const key of v.subjectKeys) {
      if (isCustomKey(key) && (customName(key).trim().length < 2 || customName(key).length > 60)) {
        ctx.addIssue({ code: "custom", path: ["subjectKeys"], message: "Custom course names need 2–60 characters" });
      }
    }
    if (v.role === "tutor") {
      const missing = v.subjectKeys.filter((k) => !v.endorsements[k]);
      if (missing.length) {
        ctx.addIssue({ code: "custom", path: ["endorsements"], message: "Add a teacher's email for every subject you want to teach" });
      }
      const emails = Object.values(v.endorsements).map((e) => e.teacherEmail);
      if (v.parentEmail && emails.includes(v.parentEmail)) {
        ctx.addIssue({ code: "custom", path: ["parentEmail"], message: "Your parent and your teacher need different email addresses" });
      }
    }
  });

export type OnboardingInput = z.input<typeof onboardingSchema>;

export const staffOnboardingSchema = z.object({
  schoolId: z.string().min(1, "Pick your school"),
  displayName: z.string().trim().min(2, "Enter the name students know you by").max(60),
});

export type StaffOnboardingInput = z.input<typeof staffOnboardingSchema>;

/** First human-readable message from a ZodError. */
export function firstIssue(err: z.ZodError): string {
  return err.issues[0]?.message ?? "Please check the form";
}
