# TierUp — Backend Spec

## Roles & auth
- Sign in with Google (OAuth). Request Calendar scopes from the account that will own Meet events (see below).
- `User.roles`: any combination of `learner`, `tutor`, `staff`. A student may be both learner and tutor.
- `staff` users belong to one School and can only read and write that school's data.
- Learners and tutors under 18 require an approved ParentConsent before **booking, accepting, or tutoring**. Browsing and messaging are allowed before that (confirm with the client whether pre-consent messaging is OK).

## Data model (suggested)
```
School        id, name, state(DC|MD|VA), city, active(bool), serviceHourGoal(default 40), approvedSpaces[]
User          id, email, name, grade, schoolId, roles[], bio, avatarUrl, availability[] (day, timeBlock), formats[] (in_person|online), createdAt
ParentConsent id, studentId, parentEmail, token, status(pending|approved|declined), sendSummaries(bool), decidedAt
Subject       id, name, group            -- seed with the 85 courses + allow custom (isCustom, createdBy)
LearnerSubject userId, subjectId, dueDate?
TutorSubject  id, tutorId, subjectId, grade?, endorserTeacherId, status(pending|approved|revoked), decidedAt
HelpRequest   id, learnerId, subjectId, description, formats[], status(open|matched|expired|closed), expiresAt(createdAt+48h)
RequestResponse id, requestId, tutorId, message, proposedTime?, createdAt
Thread        id, learnerId, tutorId, subjectId, sessionId?   -- pre-booking chat when sessionId is null
Message       id, threadId, senderId, body, createdAt, flagged(bool)
Session       id, threadId, learnerId, tutorId, subjectId, startsAt, durationMin(45), format(in_person|online),
              location?, meetUrl?, calendarEventId?, status(confirmed|completed|no_show|cancelled),
              learnerConfirmedAt?, tutorNotes?
MeetAttendance sessionId, userId, joinedAt, leftAt          -- from Meet REST API / Reports API if available
Review        id, sessionId, learnerId, stars(1-5), tags[], comment, happened(yes|no_show|cut_short)
HourLog       id, sessionId, tutorId, hours, status(logged|approved|rejected), loggedAt, reviewedBy?, reviewedAt?
Report        id, reporterId, againstUserId?, sessionId?, threadId?, messageId?, reason, status(new|dismissed|warned|paused), actions[]
TutorStatus   tutorId, paused(bool), weeklyCap(default 3)
```

## Key rules
- **Discoverability:** a tutor shows in Browse, Match and request fan-out for a subject only if the TutorSubject is `approved`, the tutor isn't paused, and their ParentConsent is approved.
- **Cross-school:** if the learner's and tutor's schools differ, the format must be `online`.
- **In person:** location must be one of `School.approvedSpaces`.
- **Booking slots:** only times where both users' availability overlaps and neither has a conflicting session. Enforce the tutor's weekly cap.
- **Thread → Session:** when booking from a pre-booking thread (same learner, tutor and subject), attach the new Session to that thread so the history is kept.
- **Hours:** `hours = durationMin/60`. A tutor can create or delete a HourLog only while its status is `logged`. Staff "approve all" applies only where `session.learnerConfirmedAt` is set. The tutor's total = the sum of approved HourLogs in the current school year.
- **Request expiry:** a job closes HelpRequests past `expiresAt`.

## One-time Google Meet per session
For every Session with `format=online`, at booking or accept time:
1. Create a Google Calendar event (on a TierUp service/organizer calendar, or the school's Workspace) with:
   - `start`/`end` set to the session time
   - `attendees` = learner + tutor (+ optional staff observer)
   - `conferenceData.createRequest` with a unique `requestId` = sessionId (`conferenceDataVersion=1`)
2. Store `meetUrl` and `calendarEventId` on the Session.
3. Restrict access: only invited attendees, no external joins without knocking (Workspace settings / Meet API space config `accessType=RESTRICTED` if using the Meet REST API `spaces.create`).
4. "Opens 10 min before / expires at end": show the Join button only from `startsAt-10m` to `startsAt+duration`. After the end, end the conference / delete the space (Meet REST API `spaces.endActiveConference`), or regenerate so the link can't be reused.
5. On cancel or reschedule: update or delete the event. A reschedule creates a **new** Meet.
6. Log attendance (join/leave) into MeetAttendance where the API allows. Shown in the staff Session log.

Never reuse a Meet link across sessions.

## API (REST sketch)
```
POST /auth/google                       sign in
POST /onboarding                        role, schoolId, grade, subjects[], customSubjects[], availability, formats, parentEmail
GET  /schools?region=DMV                dropdown list (grouped by state)
GET  /subjects                          grouped list
POST /consent/:token  {decision}        parent approves/declines (public, token-auth)

GET  /tutors?subjectId&format&sameSchool        browse
GET  /tutors/:id                                 profile + reviews + nextOpenSlot
GET  /match?subjectId                            top 3 with score + reasons[]
GET  /tutors/:id/slots?week=YYYY-MM-DD           overlap grid

POST /requests                                    create HelpRequest (fan-out notify)
GET  /requests/mine                               learner's requests + responses
POST /requests/:id/responses                      tutor responds
GET  /tutor/requests                              open requests in tutor's approved subjects (+ auto-matches, direct bookings)
POST /tutor/requests/:id/accept | /pass

POST /threads  {tutorId, subjectId, seedMessage?}  get-or-create pre-booking thread
GET  /threads, GET /threads/:id/messages, POST /threads/:id/messages

POST /sessions {tutorId, subjectId, slot, format, location?, threadId?}   -> creates Meet if online
GET  /sessions?upcoming, GET /sessions/:id
POST /sessions/:id/complete  (learner confirm)    POST /sessions/:id/review
POST /sessions/:id/notes (tutor)

GET  /tutor/hours                                 total, pending, completed sessions w/ log status
POST /hours {sessionId} | DELETE /hours/:id       tutor logs/unlogs (only when status=logged)
GET  /tutor/hours/export?format=pdf|csv

POST /reports {targetType, targetId, reason}

-- staff (scoped to own school)
GET  /staff/approvals         POST /staff/approvals/:id/approve | /revoke
GET  /staff/hours             POST /staff/hours/:id/approve | /reject   POST /staff/hours/approve-confirmed
GET  /staff/reports           POST /staff/reports/:id/{dismiss|warn|pause|notify-parents}
GET  /staff/sessions          session log incl. meetUrl + attendance
```

## Notifications (email, optionally push)
- Parent: consent request; booking created; session summaries (if opted in); report escalation.
- Teacher/staff: tutor subject approval request; hours awaiting sign-off (daily digest); new report.
- Tutor: new request in subject; response accepted; booking; hours approved/rejected; warning/pause.
- Learner: new response to request; booking confirmed (with Meet link + calendar invite); reminder 1h before.

## Moderation & privacy
- Staff can read all threads and sessions in their school. Show this notice in every chat.
- Optional: flag phone numbers, social handles and emails in messages automatically (see Report #31 example) and create an auto-Report.
- Store minimal data on minors, and keep data retention configurable per school.
- Pausing a tutor hides them everywhere and cancels future sessions, with notifications.

## Open questions for the client
1. Which teacher endorses each tutor subject? Pick from a school staff list, or enter an email?
2. Can students message before parent consent is approved?
3. Who owns the Meet events: a TierUp Workspace account, or each school's Workspace?
4. Service-hour goal: fixed at 40, or set per school?
5. Should the wireframe ideas (tag-count reviews instead of public stars, "did it happen?" check) be adopted?
