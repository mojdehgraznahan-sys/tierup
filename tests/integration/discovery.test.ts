import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Email } from "@/server/email/send";

const sent: Email[] = [];
vi.mock("@/server/email/send", () => ({
  sendEmail: async (e: Email) => void sent.push(e),
  sendEmailSafely: async (e: Email) => void sent.push(e),
}));

import { browseTutors, matchTutors, tutorProfile, tutorsForMyClasses } from "@/server/services/discovery";
import { createRequest, myOpenRequests, respondToRequest } from "@/server/services/requests";
import { getOrCreatePreBookingThread } from "@/server/services/threads";
import { createReport } from "@/server/services/reports";
import { db, makeLearner, makeSchool, makeSubjects, makeTutor, resetDb } from "./helpers";

beforeEach(async () => {
  sent.length = 0;
  await resetDb();
});
afterAll(() => db.$disconnect());

const ALL = { inPerson: true, online: true, sameSchoolOnly: false };

async function world() {
  const home = await makeSchool("Home High", ["home.test"]);
  const other = await makeSchool("Other High", ["other.test"]);
  const [algebra, bio] = await makeSubjects("Algebra II", "Biology");
  const learner = await makeLearner({ email: "lea@home.test", schoolId: home.id, avail: [[1, 930], [2, 730], [3, 1140]] });
  const viewer = { id: learner.id, schoolId: home.id };
  return { home, other, algebra: algebra!, bio: bio!, learner, viewer };
}

describe("discoverability", () => {
  it("shows only approved subjects of consented, unpaused tutors", async () => {
    const w = await world();
    const ok = await makeTutor({ email: "ok@home.test", name: "Okay Tutor", schoolId: w.home.id, subjects: { [w.algebra.id]: "approved", [w.bio.id]: "pending" } });
    await makeTutor({ email: "pending@home.test", schoolId: w.home.id, subjects: { [w.algebra.id]: "pending" } });
    await makeTutor({ email: "revoked@home.test", schoolId: w.home.id, subjects: { [w.algebra.id]: "revoked" } });
    await makeTutor({ email: "noconsent@home.test", schoolId: w.home.id, consent: "pending", subjects: { [w.algebra.id]: "approved" } });
    await makeTutor({ email: "paused@home.test", schoolId: w.home.id, paused: true, subjects: { [w.algebra.id]: "approved" } });

    const all = await browseTutors(w.viewer, ALL);
    expect(all.map((t) => t.id)).toEqual([ok.id]);
    expect(all[0]!.subjects.map((s) => s.name)).toEqual(["Algebra II"]);
    expect(await browseTutors(w.viewer, { ...ALL, subjectId: w.bio.id })).toEqual([]);
    expect(all[0]!.name).toBe("Okay T.");
  });

  it("limits other-school tutors to online and hides in-person-only ones", async () => {
    const w = await world();
    const remote = await makeTutor({ email: "r@other.test", schoolId: w.other.id, subjects: { [w.algebra.id]: "approved" } });
    await makeTutor({ email: "ip@other.test", schoolId: w.other.id, formats: ["in_person"], subjects: { [w.algebra.id]: "approved" } });
    const local = await makeTutor({ email: "l@home.test", schoolId: w.home.id, subjects: { [w.algebra.id]: "approved" } });

    const all = await browseTutors(w.viewer, ALL);
    expect(all.map((t) => t.id)).toEqual([local.id, remote.id]); // same school first
    expect(all.find((t) => t.id === remote.id)!.formats).toEqual(["online"]);

    const inPersonOnly = await browseTutors(w.viewer, { ...ALL, online: false });
    expect(inPersonOnly.map((t) => t.id)).toEqual([local.id]);
    const mine = await browseTutors(w.viewer, { ...ALL, sameSchoolOnly: true });
    expect(mine.map((t) => t.id)).toEqual([local.id]);
  });

  it("returns null profiles for undiscoverable tutors and computes the next open slot", async () => {
    const w = await world();
    const hidden = await makeTutor({ email: "h@home.test", schoolId: w.home.id, subjects: { [w.algebra.id]: "pending" } });
    const shown = await makeTutor({ email: "s@home.test", schoolId: w.home.id, subjects: { [w.algebra.id]: "approved" }, avail: [[1, 930]] });
    expect(await tutorProfile(w.viewer, hidden.id)).toBeNull();
    const profile = await tutorProfile(w.viewer, shown.id);
    expect(profile?.nextOpen).toMatch(/^Mon .* · 3:30 pm$/);
    expect(profile?.rating).toBeNull();
  });

  it("suggests tutors for the learner's classes", async () => {
    const w = await world();
    await db.learnerSubject.create({ data: { userId: w.learner.id, subjectId: w.bio.id } });
    const bioTutor = await makeTutor({ email: "b@home.test", schoolId: w.home.id, subjects: { [w.bio.id]: "approved" } });
    await makeTutor({ email: "a@home.test", schoolId: w.home.id, subjects: { [w.algebra.id]: "approved" } });
    expect((await tutorsForMyClasses(w.viewer)).map((t) => t.id)).toEqual([bioTutor.id]);
  });
});

describe("match me", () => {
  it("ranks by shared free time, same school and rating, with reasons", async () => {
    const w = await world();
    const overlapper = await makeTutor({
      email: "o@home.test", name: "Olive Overlap", schoolId: w.home.id,
      subjects: { [w.algebra.id]: "approved" }, avail: [[1, 930], [2, 730], [3, 1140]],
    });
    const remote = await makeTutor({ email: "r@other.test", name: "Remy Remote", schoolId: w.other.id, subjects: { [w.algebra.id]: "approved" }, avail: [[1, 930]] });
    const matches = await matchTutors(w.viewer, w.algebra.id);
    expect(matches.map((m) => m.id)).toEqual([overlapper.id, remote.id]);
    expect(matches[0]!.reasons).toEqual(["3 free times overlap with yours", "Same school: in person works"]);
    expect(matches[1]!.reasons).toEqual(["1 free time overlap with yours", "Other school: online via Google Meet"]);
  });
});

describe("help requests", () => {
  it("notifies eligible tutors and lists replies", async () => {
    const w = await world();
    const tutor = await makeTutor({ email: "t@home.test", name: "Tess Tutor", schoolId: w.home.id, subjects: { [w.algebra.id]: "approved" } });
    await makeTutor({ email: "ip@other.test", schoolId: w.other.id, formats: ["in_person"], subjects: { [w.algebra.id]: "approved" } });
    await makeTutor({ email: "p@home.test", schoolId: w.home.id, subjects: { [w.algebra.id]: "pending" } });

    const { request, notified } = await createRequest(w.learner.id, { subjectId: w.algebra.id, description: "Factoring quadratics" });
    expect(notified).toBe(1);
    expect(sent.map((e) => e.to)).toEqual(["t@home.test"]);
    expect(request.expiresAt.getTime() - request.createdAt.getTime()).toBeCloseTo(48 * 3600000, -4);

    await respondToRequest(tutor.id, request.id, "I can do Tue lunch");
    await expect(respondToRequest(tutor.id, request.id, "again")).rejects.toThrow(/already replied/);
    const mine = await myOpenRequests(w.learner.id);
    expect(mine[0]!.responses).toMatchObject([{ tutorId: tutor.id, tutorName: "Tess T.", message: "I can do Tue lunch" }]);
    expect(sent.at(-1)!.to).toBe("lea@home.test");
  });

  it("blocks replies from unapproved tutors and to expired requests", async () => {
    const w = await world();
    const pending = await makeTutor({ email: "p@home.test", schoolId: w.home.id, subjects: { [w.algebra.id]: "pending" } });
    const ok = await makeTutor({ email: "ok@home.test", schoolId: w.home.id, subjects: { [w.algebra.id]: "approved" } });
    const { request } = await createRequest(w.learner.id, { subjectId: w.algebra.id, description: "Factoring quadratics" });
    await expect(respondToRequest(pending.id, request.id, "Hi there")).rejects.toThrow(/teacher approval/);

    await db.helpRequest.update({ where: { id: request.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await expect(respondToRequest(ok.id, request.id, "Hi there")).rejects.toThrow(/closed or expired/);
    expect(await myOpenRequests(w.learner.id)).toEqual([]);
  });

  it("caps open requests per learner", async () => {
    const w = await world();
    for (let i = 0; i < 5; i++) await createRequest(w.learner.id, { subjectId: w.algebra.id, description: `Question number ${i}` });
    await expect(createRequest(w.learner.id, { subjectId: w.algebra.id, description: "One too many" })).rejects.toThrow(/up to 5/);
  });
});

describe("pre-booking threads", () => {
  it("creates once per learner/tutor/subject and seeds the tutor's reply", async () => {
    const w = await world();
    const tutor = await makeTutor({ email: "t@home.test", schoolId: w.home.id, subjects: { [w.algebra.id]: "approved" } });
    const { request } = await createRequest(w.learner.id, { subjectId: w.algebra.id, description: "Factoring quadratics" });
    const reply = await respondToRequest(tutor.id, request.id, "Wed 3:30 in the library?");

    const thread = await getOrCreatePreBookingThread(w.learner.id, { tutorId: tutor.id, subjectId: w.algebra.id, seedResponseId: reply.id });
    const again = await getOrCreatePreBookingThread(w.learner.id, { tutorId: tutor.id, subjectId: w.algebra.id, seedResponseId: reply.id });
    expect(again.id).toBe(thread.id);
    const messages = await db.message.findMany({ where: { threadId: thread.id } });
    expect(messages).toMatchObject([{ senderId: tutor.id, body: "Wed 3:30 in the library?" }]);
  });

  it("falls back to an approved subject and refuses hidden tutors", async () => {
    const w = await world();
    const tutor = await makeTutor({ email: "t@home.test", schoolId: w.home.id, subjects: { [w.algebra.id]: "approved", [w.bio.id]: "pending" } });
    const thread = await getOrCreatePreBookingThread(w.learner.id, { tutorId: tutor.id, subjectId: w.bio.id });
    expect(thread.subjectId).toBe(w.algebra.id);

    const hidden = await makeTutor({ email: "h@home.test", schoolId: w.home.id, consent: "pending", subjects: { [w.algebra.id]: "approved" } });
    await expect(getOrCreatePreBookingThread(w.learner.id, { tutorId: hidden.id })).rejects.toThrow(/isn't available/);
  });
});

describe("reports", () => {
  it("files a report and rejects self-reports", async () => {
    const w = await world();
    const tutor = await makeTutor({ email: "t@home.test", schoolId: w.home.id, subjects: { [w.algebra.id]: "approved" } });
    const report = await createReport(w.learner.id, { againstUserId: tutor.id, reason: "Made me uncomfortable", details: "Rude in chat" });
    expect(report).toMatchObject({ status: "new", reason: "Made me uncomfortable: Rude in chat" });
    await expect(createReport(w.learner.id, { againstUserId: w.learner.id, reason: "Something else" })).rejects.toThrow(/yourself/);
  });
});
