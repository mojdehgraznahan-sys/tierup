// Seeds the catalog (64 DMV schools, 80 courses) and a demo world that mirrors the prototype:
// Alex P. (learner), tutors Maya/Dev/Lena/Priya at "Lincoln High School (Demo)", Sam at
// "Grant High School (Demo)", and their teachers. Dates are relative to when the seed runs,
// so upcoming sessions always land next week.
// Run: npm run db:seed   (wipes and recreates all data)
import { PrismaClient, type Format, type Role, type TimeBlock } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { DMV_SCHOOLS } from "./schools";
import { SUBJECT_GROUPS } from "./subjects";
import { slotInstant, weekStart } from "../../src/lib/time";

const db = new PrismaClient();

const SLOTS: { label: string; startMinute: number; block: TimeBlock }[] = [
  { label: "7:30 am", startMinute: 7 * 60 + 30, block: "before_school" },
  { label: "Lunch", startMinute: 12 * 60 + 10, block: "lunch" },
  { label: "3:30 pm", startMinute: 15 * 60 + 30, block: "after_school" },
  { label: "4:30 pm", startMinute: 16 * 60 + 30, block: "after_school" },
  { label: "7:00 pm", startMinute: 19 * 60, block: "evening" },
];
const SPACES = ["Library", "Room 204 (Math)", "Learning commons"];
const DAY = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5 } as const;
const TIME = { "7:30": 450, "12:10": 730, "3:30": 930, "4:30": 990, "7:00": 1140 } as const;
type SlotKey = `${keyof typeof DAY}-${keyof typeof TIME}`;

const token = () => randomBytes(24).toString("base64url");
const fakeMeet = () => {
  const l = "abcdefghijkmnopqrstuvwxyz";
  const r = (n: number) => Array.from({ length: n }, () => l[Math.floor(Math.random() * l.length)]).join("");
  return `https://meet.google.com/${r(3)}-${r(4)}-${r(3)}`;
};

async function wipe() {
  const tables = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length) {
    await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} CASCADE`);
  }
}

async function main() {
  await wipe();

  // ── Catalog ──
  await db.school.createMany({ data: DMV_SCHOOLS.map((s) => ({ ...s, approvedSpaces: SPACES })) });
  const allSubjects = SUBJECT_GROUPS.flatMap(([group, courses]) =>
    courses.map((name, i) => ({ name, group, sortOrder: i })),
  );
  await db.subject.createMany({ data: allSubjects });
  const subjects = new Map((await db.subject.findMany()).map((s) => [s.name, s.id]));
  const subj = (name: string) => {
    const id = subjects.get(name);
    if (!id) throw new Error(`Unknown subject ${name}`);
    return id;
  };

  // Every real school gets the default bell-time slots; staff can edit them later.
  const realSchools = await db.school.findMany();
  await db.schoolSlot.createMany({
    data: realSchools.flatMap((s) => SLOTS.map((slot, i) => ({ ...slot, schoolId: s.id, sortOrder: i }))),
  });

  // ── Demo schools ──
  const mkDemoSchool = (name: string, domain: string) =>
    db.school.create({
      data: {
        name,
        staffEmailDomains: [domain],
        state: "DC",
        city: "Washington",
        active: true,
        isDemo: true,
        approvedSpaces: SPACES,
        slots: { create: SLOTS.map((slot, i) => ({ ...slot, sortOrder: i })) },
      },
      include: { slots: true },
    });
  const lincoln = await mkDemoSchool("Lincoln High School (Demo)", "lincoln-hs.test");
  const grant = await mkDemoSchool("Grant High School (Demo)", "grant-hs.test");
  const slotId = (school: typeof lincoln, minute: number) => school.slots.find((s) => s.startMinute === minute)!.id;

  // ── People ──
  type Person = {
    key: string;
    name: string;
    school: typeof lincoln;
    roles: Role[];
    grade?: number;
    bio?: string;
    formats?: Format[];
    avail?: SlotKey[];
    consent?: "approved" | "pending";
  };
  const people: Person[] = [
    // Staff (teachers)
    { key: "ortiz", name: "Ms. Ortiz", school: lincoln, roles: ["staff"] },
    { key: "kim", name: "Mr. Kim", school: lincoln, roles: ["staff"] },
    { key: "abara", name: "Ms. Abara", school: lincoln, roles: ["staff"] },
    { key: "duarte", name: "Ms. Duarte", school: lincoln, roles: ["staff"] },
    { key: "hale", name: "Mr. Hale", school: grant, roles: ["staff"] },
    // Tutors (from the prototype's TUTORS)
    {
      key: "maya", name: "Maya R.", school: lincoln, roles: ["tutor"], grade: 12, formats: ["in_person", "online"], consent: "approved",
      bio: "I struggled with Algebra in 9th grade and figured out how to make it click. I like working through your actual homework instead of reteaching the whole chapter.",
      avail: ["Mon-3:30", "Tue-12:10", "Tue-3:30", "Wed-4:30", "Wed-7:00", "Thu-12:10", "Thu-7:00", "Fri-3:30"],
    },
    {
      key: "dev", name: "Dev P.", school: lincoln, roles: ["tutor"], grade: 11, formats: ["online"], consent: "approved",
      bio: "Calc nerd. I'm best for quick online sessions the night before a quiz.",
      avail: ["Mon-7:00", "Wed-7:00", "Thu-7:00", "Wed-12:10"],
    },
    {
      key: "sam", name: "Sam K.", school: grant, roles: ["tutor"], grade: 12, formats: ["online"], consent: "approved",
      bio: "Future pre-med. I draw a lot of diagrams, so bring paper.",
      avail: ["Tue-4:30", "Thu-4:30", "Fri-4:30"],
    },
    {
      key: "lena", name: "Lena T.", school: lincoln, roles: ["tutor"], grade: 11, formats: ["in_person", "online"], consent: "approved",
      bio: "Lab reports and stoichiometry are my thing.",
      avail: ["Mon-12:10", "Fri-3:30", "Fri-12:10"],
    },
    {
      key: "priya", name: "Priya S.", school: lincoln, roles: ["tutor"], grade: 12, formats: ["in_person", "online"], consent: "approved",
      bio: "AP Bio 5 and fluent in Spanish. Happy to quiz you before tests.",
      avail: ["Tue-12:10", "Thu-12:10", "Wed-3:30", "Mon-4:30"],
    },
    {
      key: "jon", name: "Jon M.", school: lincoln, roles: ["tutor"], grade: 11, formats: ["online"], consent: "pending",
      avail: ["Tue-3:30", "Thu-3:30"],
    },
    // Learners
    {
      key: "alex", name: "Alex P.", school: lincoln, roles: ["learner"], grade: 10, formats: ["in_person", "online"], consent: "approved",
      avail: ["Mon-3:30", "Tue-12:10", "Tue-3:30", "Wed-7:00", "Thu-12:10", "Thu-4:30", "Thu-7:00", "Fri-3:30", "Fri-4:30", "Mon-7:00", "Wed-3:30"],
    },
    { key: "jordan", name: "Jordan L.", school: lincoln, roles: ["learner"], grade: 9, formats: ["online"], consent: "approved", avail: ["Wed-12:10"] },
    { key: "casey", name: "Casey M.", school: lincoln, roles: ["learner"], grade: 11, formats: ["online"], consent: "approved", avail: ["Thu-7:00"] },
    { key: "riley", name: "Riley S.", school: lincoln, roles: ["learner"], grade: 10, formats: ["in_person"], consent: "approved", avail: ["Fri-3:30"] },
    { key: "samw", name: "Sam W.", school: lincoln, roles: ["learner"], grade: 10, formats: ["online"], consent: "approved", avail: ["Fri-12:10"] },
  ];

  const users: Record<string, { id: string; email: string }> = {};
  for (const p of people) {
    const slug = p.name.toLowerCase().replace(/[^a-z]+/g, ".").replace(/^\.|\.$/g, "");
    const domain = p.school === lincoln ? "lincoln-hs.test" : "grant-hs.test";
    const user = await db.user.create({
      data: {
        name: p.name,
        email: `${slug}@${domain}`,
        emailVerified: new Date(),
        roles: p.roles,
        schoolId: p.school.id,
        grade: p.grade,
        bio: p.bio,
        formats: p.formats ?? [],
        onboardedAt: new Date(),
        availability: p.avail
          ? {
              create: p.avail.map((k) => {
                const [d, t] = k.split("-") as [keyof typeof DAY, keyof typeof TIME];
                return { weekday: DAY[d], slotId: slotId(p.school, TIME[t]) };
              }),
            }
          : undefined,
        consent: p.consent
          ? {
              create: {
                parentEmail: `parent.${slug}@example.com`,
                token: token(),
                status: p.consent,
                decidedAt: p.consent === "approved" ? new Date() : null,
              },
            }
          : undefined,
        tutorStatus: p.roles.includes("tutor") ? { create: {} } : undefined,
      },
    });
    users[p.key] = user;
  }
  const U = (key: string) => users[key].id;

  // ── Tutor subjects (per-subject teacher approval) ──
  const tutorSubjects: [tutor: string, subject: string, endorser: string, status: "approved" | "pending", grade: string][] = [
    ["maya", "Algebra II", "ortiz", "approved", "A"],
    ["maya", "Precalculus", "ortiz", "approved", "A"],
    ["maya", "Physics", "ortiz", "pending", "A−"],
    ["dev", "Calculus", "kim", "approved", "A"],
    ["dev", "Algebra II", "kim", "approved", "A"],
    ["sam", "Biology", "hale", "approved", "A"],
    ["sam", "Chemistry", "hale", "approved", "A−"],
    ["lena", "Algebra II", "abara", "approved", "A"],
    ["lena", "Chemistry", "abara", "pending", "B+"],
    ["priya", "Biology", "duarte", "approved", "A"],
    ["priya", "Spanish", "duarte", "approved", "A"],
    ["jon", "Spanish", "duarte", "pending", "A"],
  ];
  for (const [t, s, e, status, courseGrade] of tutorSubjects) {
    await db.tutorSubject.create({
      data: {
        tutorId: U(t),
        subjectId: subj(s),
        endorserId: U(e),
        endorserEmail: users[e].email,
        status,
        courseGrade,
        decidedAt: status === "approved" ? new Date() : null,
        decidedById: status === "approved" ? U(e) : null,
      },
    });
  }

  // Learner subjects
  for (const s of ["Algebra II", "Biology", "Chemistry", "Spanish"]) {
    await db.learnerSubject.create({ data: { userId: U("alex"), subjectId: subj(s) } });
  }

  // ── Sessions ──
  const now = new Date();
  const thisWeek = weekStart(now);
  const weekOffset = (n: number) => new Date(thisWeek.getTime() + n * 7 * 86400000);
  const at = (weeks: number, key: SlotKey) => {
    const [d, t] = key.split("-") as [keyof typeof DAY, keyof typeof TIME];
    return slotInstant(weekOffset(weeks), DAY[d], TIME[t]);
  };

  async function session(opts: {
    learner: string;
    tutor: string;
    subject: string;
    startsAt: Date;
    durationMin?: number;
    format: Format;
    status?: "confirmed" | "completed";
    confirmed?: boolean;
    messages?: [from: string, body: string][];
    review?: { stars: number; tags: string[]; comment?: string };
    hours?: "logged" | "approved" | "rejected";
    reviewer?: string;
  }) {
    const durationMin = opts.durationMin ?? 45;
    const online = opts.format === "online";
    const thread = await db.thread.create({
      data: { learnerId: U(opts.learner), tutorId: U(opts.tutor), subjectId: subj(opts.subject) },
    });
    for (const [i, [from, body]] of (opts.messages ?? []).entries()) {
      await db.message.create({
        data: { threadId: thread.id, senderId: U(from), body, createdAt: new Date(now.getTime() - (60 - i) * 60000) },
      });
    }
    const s = await db.tutoringSession.create({
      data: {
        threadId: thread.id,
        learnerId: U(opts.learner),
        tutorId: U(opts.tutor),
        subjectId: subj(opts.subject),
        startsAt: opts.startsAt,
        durationMin,
        format: opts.format,
        location: online ? null : "Library",
        meetUrl: online ? fakeMeet() : null,
        status: opts.status ?? "confirmed",
        learnerConfirmedAt: opts.confirmed ? new Date(opts.startsAt.getTime() + durationMin * 60000) : null,
      },
    });
    if (opts.review) {
      await db.review.create({ data: { sessionId: s.id, learnerId: U(opts.learner), ...opts.review } });
    }
    if (opts.hours) {
      const reviewed = opts.hours !== "logged";
      await db.hourLog.create({
        data: {
          sessionId: s.id,
          tutorId: U(opts.tutor),
          hours: durationMin / 60,
          status: opts.hours,
          reviewedById: reviewed ? U(opts.reviewer ?? "ortiz") : null,
          reviewedAt: reviewed ? new Date() : null,
        },
      });
    }
    return s;
  }

  // Alex's upcoming sessions (next week), as in the prototype.
  await session({
    learner: "alex", tutor: "maya", subject: "Algebra II", startsAt: at(1, "Tue-3:30"), format: "in_person",
    messages: [["alex", "Can we do problems 4–9?"], ["maya", "Yes, bring your notes"]],
  });
  await session({
    learner: "alex", tutor: "priya", subject: "Biology", startsAt: at(1, "Thu-12:10"), format: "online",
    messages: [["alex", "Test is Friday 😬"], ["priya", "No stress. I'll send the Meet link reminder at lunch"]],
  });

  // Maya's history: 15 approved sessions (14.5 h) with 12 reviews averaging 4.9.
  const learnersCycle = ["jordan", "casey", "riley", "samw", "alex"];
  const reviewTexts = [
    "Finally get factoring. She used my actual homework.",
    "Patient and on time every session.",
  ];
  for (let i = 0; i < 15; i++) {
    const durationMin = i < 2 ? 45 : 60;
    await session({
      learner: learnersCycle[i % learnersCycle.length], tutor: "maya", subject: i % 3 === 0 ? "Precalculus" : "Algebra II",
      startsAt: at(-3 - Math.floor(i / 3), (["Mon-3:30", "Tue-3:30", "Thu-12:10"] as SlotKey[])[i % 3]),
      durationMin, format: i % 2 ? "online" : "in_person", status: "completed", confirmed: true, hours: "approved",
      review: i < 12 ? { stars: i === 5 ? 4 : 5, tags: ["Explained clearly", "Patient"], comment: reviewTexts[i] } : undefined,
    });
  }
  // Maya's "Completed sessions" card: one unlogged, two waiting for sign-off.
  await session({ learner: "alex", tutor: "maya", subject: "Algebra II", startsAt: at(0, "Tue-3:30"), format: "in_person", status: "completed", confirmed: true });
  await session({ learner: "jordan", tutor: "maya", subject: "Algebra II", startsAt: at(-1, "Thu-3:30"), durationMin: 60, format: "online", status: "completed", confirmed: true, hours: "logged" });
  await session({ learner: "casey", tutor: "maya", subject: "Precalculus", startsAt: at(-2, "Mon-3:30"), durationMin: 60, format: "online", status: "completed", confirmed: false, hours: "logged" });

  // Other tutors' hours waiting for staff (prototype otherHours) plus a little review history.
  await session({ learner: "riley", tutor: "dev", subject: "Calculus", startsAt: at(-1, "Wed-7:00"), durationMin: 60, format: "online", status: "completed", confirmed: false, hours: "logged" });
  await session({ learner: "samw", tutor: "lena", subject: "Algebra II", startsAt: at(-1, "Fri-12:10"), format: "online", status: "completed", confirmed: true, hours: "logged" });
  await session({ learner: "alex", tutor: "priya", subject: "Biology", startsAt: at(-1, "Thu-12:10"), format: "online", status: "completed", confirmed: true, hours: "logged" });
  for (const [tutor, subject, stars] of [
    ["dev", "Calculus", 5], ["dev", "Calculus", 4], ["dev", "Algebra II", 5],
    ["lena", "Algebra II", 5], ["lena", "Algebra II", 5],
    ["priya", "Biology", 5], ["priya", "Spanish", 4], ["priya", "Biology", 5],
  ] as const) {
    await session({
      learner: "jordan", tutor, subject, startsAt: at(-6, "Wed-7:00"), format: "online", status: "completed",
      confirmed: true, hours: "approved", reviewer: tutor === "priya" ? "duarte" : "kim", review: { stars, tags: ["On time"] },
    });
  }

  // ── Help requests ──
  const in48h = new Date(now.getTime() + 48 * 3600000);
  const spanish = await db.helpRequest.create({
    data: { learnerId: U("alex"), subjectId: subj("Spanish"), description: "Spanish III essay", formats: ["in_person", "online"], expiresAt: in48h, createdAt: new Date(now.getTime() - 2 * 3600000) },
  });
  await db.requestResponse.create({
    data: { requestId: spanish.id, tutorId: U("priya"), message: "I can help with your thesis and past-tense verbs. Wed 3:30 in the library or online?", createdAt: new Date(now.getTime() - 3600000) },
  });
  await db.helpRequest.create({
    data: { learnerId: U("alex"), subjectId: subj("Chemistry"), description: "Chem lab report", formats: ["in_person", "online"], expiresAt: in48h },
  });
  // Requests in Maya's subjects (her dashboard inbox).
  await db.helpRequest.create({
    data: { learnerId: U("jordan"), subjectId: subj("Algebra II"), description: "Factoring help", formats: ["online"], expiresAt: in48h },
  });
  await db.helpRequest.create({
    data: { learnerId: U("casey"), subjectId: subj("Precalculus"), description: "Unit circle", formats: ["online"], expiresAt: in48h },
  });

  // ── Report #31-style example: off-platform contact ──
  const jonThread = await db.thread.create({ data: { learnerId: U("riley"), tutorId: U("jon"), subjectId: subj("Spanish") } });
  await db.message.create({ data: { threadId: jonThread.id, senderId: U("jon"), body: "ok see you thursday", createdAt: new Date(now.getTime() - 3 * 3600000) } });
  const flagged = await db.message.create({
    data: { threadId: jonThread.id, senderId: U("jon"), body: "just text me instead, my number is …", flagged: true, createdAt: new Date(now.getTime() - 2 * 3600000) },
  });
  await db.report.create({
    data: {
      reporterId: U("riley"), againstUserId: U("jon"), threadId: jonThread.id, messageId: flagged.id,
      reason: "Off-platform contact", createdAt: new Date(now.getTime() - 3600000),
    },
  });

  const counts = {
    schools: await db.school.count(),
    subjects: await db.subject.count(),
    users: await db.user.count(),
    sessions: await db.tutoringSession.count(),
  };
  console.log("Seeded", counts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
