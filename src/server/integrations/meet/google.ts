import "server-only";
import { calendar, type calendar_v3 } from "@googleapis/calendar";
import { meet } from "@googleapis/meet";
import { EDUCATION_SCOPES, organizerAuth } from "./google-auth";
import type { Meeting, MeetingRef, MeetingRequest, MeetProvider, MeetTranscript, MeetTranscriptLine } from "./types";

// Needs a Google Workspace account that owns the events (BACKEND.md open question #3): a service
// account with domain-wide delegation, impersonating GOOGLE_MEET_ORGANIZER. See google-auth.ts for
// the keyless (Cloud Run) and JSON-key options. GOOGLE_MEET_CALENDAR_ID is optional ("primary").

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
  private auths = new Map<string, ReturnType<typeof organizerAuth>>();
  private calendarId: string;

  constructor(private env: NodeJS.ProcessEnv = process.env) {
    this.calendarId = env.GOOGLE_MEET_CALENDAR_ID ?? "primary";
  }

  /** Delegated auth as the default organizer, or as a school's own Workspace user. */
  private auth(organizer?: string | null) {
    const key = organizer ?? "";
    let getAuth = this.auths.get(key);
    if (!getAuth) {
      getAuth = organizer ? organizerAuth(this.env, organizer, EDUCATION_SCOPES) : organizerAuth(this.env);
      this.auths.set(key, getAuth);
    }
    return getAuth();
  }

  async createMeeting(req: MeetingRequest): Promise<Meeting> {
    const cal = calendar({ version: "v3", auth: await this.auth(req.organizer) });
    const calendarId = req.organizer ? "primary" : this.calendarId;
    const body = buildEventBody(req);
    let event: calendar_v3.Schema$Event;
    try {
      event = (await cal.events.insert({ calendarId, conferenceDataVersion: 1, sendUpdates: "all", requestBody: body })).data;
    } catch (err) {
      // 409: the event already exists (a retry). Reuse it rather than creating a second Meet.
      if ((err as { code?: number }).code !== 409) throw err;
      event = (await cal.events.get({ calendarId, eventId: body.id! })).data;
    }

    const meetUrl = event.hangoutLink ?? event.conferenceData?.entryPoints?.find((e) => e.entryPointType === "video")?.uri;
    if (!meetUrl) throw new Error(`Calendar event ${event.id} has no Meet link`);

    const spaceName = await this.configure(event.conferenceData?.conferenceId ?? null, req);
    return { meetUrl, calendarEventId: event.id ?? null, spaceName };
  }

  /**
   * Only invited attendees join directly; others must knock (accessType=RESTRICTED). For schools
   * whose Workspace transcribes, also turn on automatic transcription. Google starts it when the
   * host or a co-host joins; otherwise the tutor starts it from Meet (Activities → Transcripts).
   */
  private async configure(meetingCode: string | null, req: MeetingRequest): Promise<string | null> {
    if (!meetingCode) return null;
    const api = meet({ version: "v2", auth: await this.auth(req.organizer) });
    try {
      const space = (await api.spaces.get({ name: `spaces/${meetingCode}` })).data;
      if (!space.name) return null;
      const transcribe = !!req.autoTranscribe;
      await api.spaces.patch({
        name: space.name,
        updateMask: transcribe ? "config.accessType,config.artifactConfig.transcriptionConfig.autoTranscriptionGeneration" : "config.accessType",
        requestBody: {
          config: {
            accessType: "RESTRICTED",
            ...(transcribe ? { artifactConfig: { transcriptionConfig: { autoTranscriptionGeneration: "ON" } } } : {}),
          },
        },
      });
      return space.name;
    } catch (err) {
      // Not fatal: the event still only invites the two students. Log for follow-up.
      console.error(`Couldn't configure Meet space ${meetingCode}`, err);
      return null;
    }
  }

  async setAutoTranscribe(meeting: MeetingRef, on: boolean): Promise<void> {
    if (!meeting.spaceName) return;
    const api = meet({ version: "v2", auth: await this.auth(meeting.organizer) });
    await api.spaces.patch({
      name: meeting.spaceName,
      updateMask: "config.artifactConfig.transcriptionConfig.autoTranscriptionGeneration",
      requestBody: { config: { artifactConfig: { transcriptionConfig: { autoTranscriptionGeneration: on ? "ON" : "OFF" } } } },
    });
  }

  async cancelMeeting(meeting: MeetingRef): Promise<void> {
    if (meeting.calendarEventId) {
      const cal = calendar({ version: "v3", auth: await this.auth(meeting.organizer) });
      await cal.events.delete({ calendarId: meeting.organizer ? "primary" : this.calendarId, eventId: meeting.calendarEventId, sendUpdates: "all" });
    }
    await this.endMeeting(meeting);
  }

  async endMeeting(meeting: MeetingRef): Promise<void> {
    if (!meeting.spaceName) return;
    const api = meet({ version: "v2", auth: await this.auth(meeting.organizer) });
    try {
      await api.spaces.endActiveConference({ name: meeting.spaceName, requestBody: {} });
    } catch (err) {
      // 400/404 when nobody is in the call: nothing to end.
      const code = (err as { code?: number }).code;
      if (code !== 400 && code !== 404) throw err;
    }
  }

  /** Reads Meet's transcript of the (latest) call in this space, line by line with speaker names. */
  async fetchTranscript(meeting: MeetingRef): Promise<MeetTranscript> {
    if (!meeting.spaceName) return { state: "none" };
    const api = meet({ version: "v2", auth: await this.auth(meeting.organizer) });
    const records = (await api.conferenceRecords.list({ filter: `space.name = "${meeting.spaceName}"` })).data.conferenceRecords ?? [];
    const record = records.sort((a, b) => (b.startTime ?? "").localeCompare(a.startTime ?? ""))[0];
    if (!record?.name) return { state: "none" };
    if (!record.endTime) return { state: "pending" };

    const transcripts = (await api.conferenceRecords.transcripts.list({ parent: record.name })).data.transcripts ?? [];
    if (transcripts.length === 0) return { state: "none" };
    if (transcripts.some((t) => t.state !== "FILE_GENERATED")) return { state: "pending" };

    const names = new Map<string, string | null>();
    const participants = (await api.conferenceRecords.participants.list({ parent: record.name, pageSize: 50 })).data.participants ?? [];
    for (const p of participants) if (p.name) names.set(p.name, p.signedinUser?.displayName ?? p.anonymousUser?.displayName ?? null);

    const lines: MeetTranscriptLine[] = [];
    for (const t of transcripts) {
      let pageToken: string | undefined;
      do {
        const page = (await api.conferenceRecords.transcripts.entries.list({ parent: t.name!, pageSize: 100, pageToken })).data;
        for (const e of page.transcriptEntries ?? []) {
          if (!e.text?.trim()) continue;
          lines.push({ speakerName: (e.participant && names.get(e.participant)) ?? null, at: new Date(e.startTime ?? record.startTime ?? Date.now()), text: e.text.trim() });
        }
        pageToken = page.nextPageToken ?? undefined;
      } while (pageToken);
    }
    return { state: "ready", lines: lines.sort((a, b) => a.at.getTime() - b.at.getTime()) };
  }
}
