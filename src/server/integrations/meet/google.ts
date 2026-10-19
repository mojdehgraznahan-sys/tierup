import "server-only";
import { auth as googleAuth, calendar, type calendar_v3 } from "@googleapis/calendar";
import { meet } from "@googleapis/meet";
import type { Meeting, MeetingRequest, MeetProvider } from "./types";

// Needs a Google Workspace account that owns the events (BACKEND.md open question #3):
// a service account with domain-wide delegation, impersonating GOOGLE_MEET_ORGANIZER.
//   GOOGLE_SERVICE_ACCOUNT_KEY  base64 of the service account's JSON key
//   GOOGLE_MEET_ORGANIZER       e.g. sessions@tierup.app (a Workspace user)
//   GOOGLE_MEET_CALENDAR_ID     optional, defaults to "primary"
const SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/meetings.space.created",
];

/** Calendar event ids must be base32hex (a–v, 0–9), 5–1024 chars. */
export function eventIdFor(sessionId: string): string {
  return `tu${Buffer.from(sessionId).toString("hex")}`.toLowerCase().replace(/[^a-v0-9]/g, "0");
}

/** The Calendar API request body for a session's event with its own Meet. */
export function buildEventBody(req: MeetingRequest): calendar_v3.Schema$Event {
  const end = new Date(req.startsAt.getTime() + req.durationMin * 60000);
  return {
    id: eventIdFor(req.sessionId),
    summary: req.summary,
    description: req.description,
    start: { dateTime: req.startsAt.toISOString(), timeZone: "America/New_York" },
    end: { dateTime: end.toISOString(), timeZone: "America/New_York" },
    attendees: req.attendees.map((a) => ({ email: a.email, displayName: a.name })),
    guestsCanInviteOthers: false,
    guestsCanModify: false,
    guestsCanSeeOtherGuests: true,
    conferenceData: {
      // requestId = sessionId: Google returns the same conference for retries of one session.
      createRequest: { requestId: req.sessionId, conferenceSolutionKey: { type: "hangoutsMeet" } },
    },
    reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 10 }] },
  };
}

export class GoogleMeetProvider implements MeetProvider {
  readonly name = "google" as const;
  // Created through googleapis' bundled auth so Calendar and Meet clients accept it.
  private auth: InstanceType<typeof googleAuth.JWT>;
  private calendarId: string;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    const key = env.GOOGLE_SERVICE_ACCOUNT_KEY;
    const organizer = env.GOOGLE_MEET_ORGANIZER;
    if (!key || !organizer) {
      throw new Error("MEET_PROVIDER=google needs GOOGLE_SERVICE_ACCOUNT_KEY and GOOGLE_MEET_ORGANIZER");
    }
    const json = JSON.parse(Buffer.from(key, "base64").toString("utf8")) as { client_email: string; private_key: string };
    this.auth = new googleAuth.JWT({ email: json.client_email, key: json.private_key, scopes: SCOPES, subject: organizer });
    this.calendarId = env.GOOGLE_MEET_CALENDAR_ID ?? "primary";
  }

  async createMeeting(req: MeetingRequest): Promise<Meeting> {
    const cal = calendar({ version: "v3", auth: this.auth });
    const body = buildEventBody(req);
    let event: calendar_v3.Schema$Event;
    try {
      event = (await cal.events.insert({ calendarId: this.calendarId, conferenceDataVersion: 1, sendUpdates: "all", requestBody: body })).data;
    } catch (err) {
      // 409: the event already exists (a retry). Reuse it rather than creating a second Meet.
      if ((err as { code?: number }).code !== 409) throw err;
      event = (await cal.events.get({ calendarId: this.calendarId, eventId: body.id! })).data;
    }

    const meetUrl = event.hangoutLink ?? event.conferenceData?.entryPoints?.find((e) => e.entryPointType === "video")?.uri;
    if (!meetUrl) throw new Error(`Calendar event ${event.id} has no Meet link`);

    const spaceName = await this.restrict(event.conferenceData?.conferenceId ?? null);
    return { meetUrl, calendarEventId: event.id ?? null, spaceName };
  }

  /** Only invited attendees join directly; others must knock (Meet API accessType=RESTRICTED). */
  private async restrict(meetingCode: string | null): Promise<string | null> {
    if (!meetingCode) return null;
    const api = meet({ version: "v2", auth: this.auth });
    try {
      const space = (await api.spaces.get({ name: `spaces/${meetingCode}` })).data;
      if (!space.name) return null;
      await api.spaces.patch({ name: space.name, updateMask: "config.accessType", requestBody: { config: { accessType: "RESTRICTED" } } });
      return space.name;
    } catch (err) {
      // Not fatal: the event still only invites the two students. Log for follow-up.
      console.error(`Couldn't restrict Meet space ${meetingCode}`, err);
      return null;
    }
  }

  async cancelMeeting(meeting: { calendarEventId: string | null; spaceName: string | null }): Promise<void> {
    if (meeting.calendarEventId) {
      const cal = calendar({ version: "v3", auth: this.auth });
      await cal.events.delete({ calendarId: this.calendarId, eventId: meeting.calendarEventId, sendUpdates: "all" });
    }
    await this.endMeeting(meeting);
  }

  async endMeeting(meeting: { spaceName: string | null }): Promise<void> {
    if (!meeting.spaceName) return;
    const api = meet({ version: "v2", auth: this.auth });
    try {
      await api.spaces.endActiveConference({ name: meeting.spaceName, requestBody: {} });
    } catch (err) {
      // 400/404 when nobody is in the call: nothing to end.
      const code = (err as { code?: number }).code;
      if (code !== 400 && code !== 404) throw err;
    }
  }
}
