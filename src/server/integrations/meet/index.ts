import "server-only";
import { FakeMeetProvider } from "./fake";
import type { MeetProvider } from "./types";

export type { Meeting, MeetingRequest, MeetProvider } from "./types";

let provider: MeetProvider | null = null;

/** MEET_PROVIDER=google uses Google Calendar/Meet; anything else uses the fake (dev/tests). */
export async function getMeetProvider(): Promise<MeetProvider> {
  if (provider) return provider;
  if (process.env.MEET_PROVIDER === "google") {
    const { GoogleMeetProvider } = await import("./google");
    provider = new GoogleMeetProvider();
  } else {
    provider = new FakeMeetProvider();
  }
  return provider;
}

/** Tests swap in their own provider. */
export function setMeetProvider(p: MeetProvider | null) {
  provider = p;
}
