import { describe, expect, it } from "vitest";
import { detectContactInfo } from "./moderation";

describe("contact-info detection", () => {
  it.each([
    ["call 202-555-0143 tonight", "phone number"],
    ["my cell is (571) 555 0199", "phone number"],
    ["email me at maya.r@gmail.com", "email address"],
    ["follow @maya_studies", "social handle"],
    ["add me on snapchat", "social app"],
    ["just text me instead, my number is …", "request to talk elsewhere"],
  ])("flags %j", (body, kind) => {
    expect(detectContactInfo(body)).toContain(kind);
  });

  it.each([
    "Can we do problems 4–9?",
    "Test is Friday 😬",
    "Meet in Room 204 at 3:30",
    "The answer is 3.14159 and x = 12",
    "Chapter 7, questions 10-15",
  ])("leaves normal tutoring talk alone: %j", (body) => {
    expect(detectContactInfo(body)).toEqual([]);
  });
});
