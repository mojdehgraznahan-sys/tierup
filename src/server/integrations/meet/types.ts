// One-time Google Meet per online session (BACKEND.md › One-time Google Meet per session).

export type MeetingRequest = {
  /** Used as the idempotency key, so a retry never creates a second meeting. */
  sessionId: string;
  summary: string;
  description: string;
  startsAt: Date;
  durationMin: number;
  attendees: { email: string; name?: string }[];
};

export type Meeting = {
  meetUrl: string;
  calendarEventId: string | null;
  /** Meet REST API resource name (spaces/…), when known. Used to end the conference. */
  spaceName: string | null;
};

export interface MeetProvider {
  readonly name: "fake" | "google";
  /** Creates a calendar event with its own Meet, invites both students, restricts access. */
  createMeeting(req: MeetingRequest): Promise<Meeting>;
  /** Cancels the event (notifying attendees) so the link can't be used. */
  cancelMeeting(meeting: { calendarEventId: string | null; spaceName: string | null }): Promise<void>;
  /** Ends any active conference after the session ends. */
  endMeeting(meeting: { spaceName: string | null }): Promise<void>;
}
