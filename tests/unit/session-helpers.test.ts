import { describe, expect, it } from "vitest";
import { homePathFor, safeCallbackPath } from "@/server/policies/rules";
import { resolveMode } from "@/components/app/mode";
import { displayName, firstName } from "@/lib/names";

describe("post-login routing", () => {
  const done = new Date();
  it("sends each role to its home", () => {
    expect(homePathFor({ roles: [], onboardedAt: null })).toBe("/onboarding");
    expect(homePathFor({ roles: ["learner"], onboardedAt: done })).toBe("/home");
    expect(homePathFor({ roles: ["tutor"], onboardedAt: done })).toBe("/dashboard");
    expect(homePathFor({ roles: ["learner", "tutor"], onboardedAt: done })).toBe("/home");
    expect(homePathFor({ roles: ["staff"], onboardedAt: done })).toBe("/staff");
  });

  it("only accepts same-site callback paths", () => {
    expect(safeCallbackPath("/onboarding?role=tutor")).toBe("/onboarding?role=tutor");
    expect(safeCallbackPath("https://evil.test")).toBeNull();
    expect(safeCallbackPath("//evil.test")).toBeNull();
    expect(safeCallbackPath("/\\evil.test")).toBeNull();
    expect(safeCallbackPath(undefined)).toBeNull();
  });

  it("resolves the nav mode", () => {
    expect(resolveMode(["learner", "tutor"], "tutor")).toBe("tutor");
    expect(resolveMode(["learner", "tutor"], undefined)).toBe("learner");
    expect(resolveMode(["learner"], "tutor")).toBe("learner");
    expect(resolveMode(["staff"], "tutor")).toBe("staff");
  });
});

describe("names", () => {
  it("shows students as first name + last initial", () => {
    expect(displayName("Maya Rodriguez")).toBe("Maya R.");
    expect(displayName("Maya R.")).toBe("Maya R.");
    expect(displayName("Mary Ann Lee")).toBe("Mary L.");
    expect(displayName("Cher")).toBe("Cher");
    expect(firstName("Alex Park")).toBe("Alex");
  });
});
