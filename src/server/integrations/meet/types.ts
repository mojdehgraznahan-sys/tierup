// One-time Google Meet per online session (BACKEND.md › One-time Google Meet per session).

export type MeetingRequest = {
  /** Used as the idempotency key, so a retry never creates a second meeting. */
  sessionId: string;
  summary: string;
  description: string;
  startsAt: Date;
  durationMin: number;
  attendees: { email: string; name?: string }[];
  /**
   * A school's own Workspace user to host the meeting (Google Workspace for Education schools),
   * instead of GOOGLE_MEET_ORGANIZER. Its Meet transcribes the session.
   */
  organizer?: string | null;
  /** Turn on Meet's automatic transcription for this meeting. */
  autoTranscribe?: boolean;
};

/** Who owns a meeting: null means the default GOOGLE_MEET_ORGANIZER. */
export type MeetingRef = { calendarEventId?: string | null; spaceName: string | null; organizer?: string | null };

export type MeetTranscriptLine = { speakerName: string | null; at: Date; text: string };

export type MeetTranscript =
  /** No transcript for this meeting (never started, or the call never happened). */
  | { state: "none" }
  /** Meet is still writing it. */
  | { state: "pending" }
  | { state: "ready"; lines: MeetTranscriptLine[] };

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
  cancelMeeting(meeting: MeetingRef): Promise<void>;
  /** Ends any active conference after the session ends. */
  endMeeting(meeting: MeetingRef): Promise<void>;
  /** Turns Meet's automatic transcription on or off (a student opted this session out). */
  setAutoTranscribe(meeting: MeetingRef, on: boolean): Promise<void>;
  /** The meeting's Meet transcript, for schools whose Workspace transcribes. */
  fetchTranscript(meeting: MeetingRef): Promise<MeetTranscript>;
}
