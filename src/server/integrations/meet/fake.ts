import { createHash } from "node:crypto";
import type { Meeting, MeetingRequest, MeetProvider } from "./types";

const LETTERS = "abcdefghijkmnopqrstuvwxyz";

/** Meet-shaped code derived from the session id: unique per session, stable across retries. */
export function fakeMeetCode(sessionId: string): string {
  const bytes = createHash("sha256").update(sessionId).digest();
  const pick = (start: number, n: number) => Array.from({ length: n }, (_, i) => LETTERS[bytes[start + i]! % LETTERS.length]).join("");
  return `${pick(0, 3)}-${pick(3, 4)}-${pick(7, 3)}`;
}

/**
 * Local development and tests: no Google calls. Links look like real Meet links but don't
 * open a meeting.
 */
export class FakeMeetProvider implements MeetProvider {
  readonly name = "fake" as const;
  readonly created: MeetingRequest[] = [];
  readonly cancelled: string[] = [];
  readonly ended: string[] = [];

  async createMeeting(req: MeetingRequest): Promise<Meeting> {
    this.created.push(req);
    const code = fakeMeetCode(req.sessionId);
    return { meetUrl: `https://meet.google.com/${code}`, calendarEventId: `fake-${req.sessionId}`, spaceName: `spaces/${code}` };
  }

  async cancelMeeting(meeting: { calendarEventId: string | null }): Promise<void> {
    if (meeting.calendarEventId) this.cancelled.push(meeting.calendarEventId);
  }

  async endMeeting(meeting: { spaceName: string | null }): Promise<void> {
    if (meeting.spaceName) this.ended.push(meeting.spaceName);
  }
}
