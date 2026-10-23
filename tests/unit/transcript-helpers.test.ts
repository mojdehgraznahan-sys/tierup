import { afterEach, describe, expect, it, vi } from "vitest";
import { speakerFor } from "@/server/integrations/meet/speakers";
import { googleEducationOrganizer } from "@/server/policies/rules";
import { pseudonym, redact } from "@/lib/deidentify";

afterEach(() => vi.unstubAllEnvs());

describe("Google Education schools setting", () => {
  it("maps a school's staff domain to its meeting organizer", () => {
    vi.stubEnv("GOOGLE_EDUCATION_SCHOOLS", " Lincoln-HS.org = tierup@lincoln-hs.org , bad-entry, grant.org=x@grant.org");
    expect(googleEducationOrganizer(["lincoln-hs.org"])).toBe("tierup@lincoln-hs.org");
    expect(googleEducationOrganizer(["other.org", "GRANT.org"])).toBe("x@grant.org");
    expect(googleEducationOrganizer(["other.org"])).toBeNull();
  });

  it("is empty when unset", () => {
    expect(googleEducationOrganizer(["lincoln-hs.org"])).toBeNull();
  });
});

describe("Meet speaker names", () => {
  const people = [
    { label: "Tutor", name: "Maya Rodriguez" },
    { label: "Learner", name: "Alex P." },
  ];
  it("matches by first name, case-insensitively", () => {
    expect(speakerFor("maya r", people)).toBe("Tutor");
    expect(speakerFor("Alex Park", people)).toBe("Learner");
    expect(speakerFor("Visitor", people)).toBeNull();
    expect(speakerFor(null, people)).toBeNull();
  });
});

describe("de-identification", () => {
  it("removes names and contact details without nesting labels", () => {
    const people = [
      { role: "Tutor", name: "Tom Tutor" },
      { role: "Learner", name: "Alex P." },
    ];
    expect(redact("Alex, ask Tom Tutor at tom@x.org, (301) 555-0100 or @tom_t", people)).toBe("[Learner], ask [Tutor] [Tutor] at [email], [phone] or [handle]");
    expect(redact("Alexander is fine", people)).toBe("Alexander is fine");
  });

  it("gives each user a stable code that depends on the secret salt", () => {
    expect(pseudonym("u1", "salt")).toBe(pseudonym("u1", "salt"));
    expect(pseudonym("u1", "salt")).not.toBe(pseudonym("u2", "salt"));
    expect(pseudonym("u1", "salt")).not.toBe(pseudonym("u1", "other"));
  });
});
