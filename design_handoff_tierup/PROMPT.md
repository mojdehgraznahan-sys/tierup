# Prompt for Claude Code

Paste the following into Claude Code from the root of this folder (or a new repo containing it).

---

You're building **TierUp** ("Team Up, TierUp"), a peer-tutoring web app for DMV private high schools. Students who need help are matched with student tutors, who earn service hours.

Reference material in this folder:
- `TierUp Prototype.html`: the clickable high-fidelity prototype. Open it in a browser. It is the **source of truth for UI and behavior**. All data in it is mocked; don't copy its code, rebuild it properly.
- `screenshots/`: static captures of every prototype screen, for quick visual reference.
- `TierUp Wireframes.html`: low-fidelity layout options, including **mobile** layouts.
- `README.md`: overview and **design tokens** (colors, fonts, shape language).
- `SCREENS.md`: every screen, control, and piece of copy.
- `USER_JOURNEYS.md`: end-to-end flows for learner, tutor, and staff.
- `BACKEND.md`: data model, business rules, API, the **one-time Google Meet per online session** integration, notifications, and open questions.

Please:
1. Read all the markdown files, then open the prototype and click through every journey in `USER_JOURNEYS.md`.
2. Propose a stack (default: Next.js App Router + TypeScript + Tailwind + Postgres via Prisma + NextAuth Google provider + Google Calendar API for Meet + Resend/SMTP for email). Propose a folder structure, then wait for my OK.
3. Build in this order, with a working app at each step:
   1. Schema + seed (DMV schools list, 85 subjects, demo users matching the prototype).
   2. Auth + onboarding + parent consent flow.
   3. Browse / Match / Requests + tutor profile.
   4. Messaging threads (pre-booking chat → session thread).
   5. Booking with the availability-overlap grid + **Google Meet creation per online session** (single-use, restricted, time-boxed).
   6. Sessions page, completion and review.
   7. Tutor dashboard with hour logging.
   8. Staff moderation: approvals, service hours, reports, session log.
   9. Notifications and the request-expiry job.
   10. Responsive/mobile pass using the wireframes.
4. Enforce every rule in `BACKEND.md › Key rules` on the server, not just the UI.
5. Match the visual design: background `#FDFBF7`, ink `#3B2314`, gold primary `#DDA15E`, pink secondary `#D954AA`, Archivo 800 @ 112% width headings, Barlow body, square hairline "blueprint" cards with + corner marks.
6. List anything ambiguous (see "Open questions" in `BACKEND.md`) before you start on it, instead of guessing.
