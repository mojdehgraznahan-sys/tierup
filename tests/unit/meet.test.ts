import { describe, expect, it } from "vitest";
import { FakeMeetProvider, fakeMeetCode } from "@/server/integrations/meet/fake";
import { buildEventBody, eventIdFor } from "@/server/integrations/meet/google";

const req = {
  sessionId: "cmabc123xyz",
  summary: "TierUp: Algebra II with Maya R.",
  description: "One-time TierUp session.",
  startsAt: new Date("2026-10-20T16:10:00Z"),
  durationMin: 45,
  attendees: [{ email: "alex@x.test", name: "Alex P." }, { email: "maya@x.test", name: "Maya R." }],
};

describe("Google Meet event body", () => {
  it("creates a 45-minute event with its own Meet, keyed to the session", () => {
    const body = buildEventBody(req);
    expect(body.start?.dateTime).toBe("2026-10-20T16:10:00.000Z");
    expect(body.end?.dateTime).toBe("2026-10-20T16:55:00.000Z");
    expect(body.conferenceData?.createRequest).toEqual({ requestId: "cmabc123xyz", conferenceSolutionKey: { type: "hangoutsMeet" } });
    expect(body.attendees?.map((a) => a.email)).toEqual(["alex@x.test", "maya@x.test"]);
    expect(body.guestsCanInviteOthers).toBe(false);
  });

  it("uses a valid, stable base32hex event id", () => {
    const id = eventIdFor("cmabc123xyz");
    expect(id).toMatch(/^[a-v0-9]{5,1024}$/);
    expect(eventIdFor("cmabc123xyz")).toBe(id);
    expect(eventIdFor("cmabc123xyw")).not.toBe(id);
  });
});

describe("fake provider", () => {
  it("gives each session its own stable Meet-shaped link", async () => {
    const fake = new FakeMeetProvider();
    const a = await fake.createMeeting(req);
    const again = await fake.createMeeting(req);
    const b = await fake.createMeeting({ ...req, sessionId: "other" });
    expect(a.meetUrl).toMatch(/^https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/);
    expect(again.meetUrl).toBe(a.meetUrl);
    expect(b.meetUrl).not.toBe(a.meetUrl);
    expect(fakeMeetCode("x")).toHaveLength(12);
  });
});

import { delegationClaims } from "@/server/integrations/meet/google-auth";

describe("keyless delegation", () => {
  it("builds a one-hour JWT-bearer assertion for the organizer", () => {
    const claims = delegationClaims("meet@p.iam.gserviceaccount.com", "sessions@school.org", ["a", "b"], Date.UTC(2026, 9, 20, 12));
    expect(claims).toEqual({
      iss: "meet@p.iam.gserviceaccount.com",
      sub: "sessions@school.org",
      scope: "a b",
      aud: "https://oauth2.googleapis.com/token",
      iat: 1792497600,
      exp: 1792501200,
    });
  });
});
