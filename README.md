# TierUp

Peer tutoring for DMV private high schools. *Team Up, TierUp.*

Design reference: [`design_handoff_tierup/`](design_handoff_tierup/README.md) (the prototype is the source of truth for UI and behavior).

## Stack
Next.js 15 (App Router) · TypeScript · Tailwind v4 · Postgres 17 + Prisma 6 · Auth.js (Google) · Google Calendar/Meet · Resend · Vitest · Playwright

## Local setup
```bash
npm install
cp .env.example .env        # already done if .env exists
npm run db:start            # terminal 1: local Postgres on :5433 (data in .data/pg), no Docker needed
npm run db:migrate          # apply migrations
npm run db:seed             # 64 DMV schools, 80 courses, demo users (wipes data)
npm run dev                 # terminal 2: http://localhost:3000
```

### Sign-in
- **Google:** set `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`. In Google Cloud, the OAuth client needs the redirect URI `http://localhost:3000/api/auth/callback/google` (plus your deployed URL later).
- **Email link:** with `RESEND_API_KEY` empty, sign-in links, parent-consent links and teacher emails are printed to the dev server console. Any seeded demo user can sign in this way, e.g. `alex.p@lincoln-hs.test` (learner), `maya.r@lincoln-hs.test` (tutor), `ms.ortiz@lincoln-hs.test` (staff).
- **Staff:** teachers become staff by signing in with an email on their school's `staffEmailDomains`. The demo schools use `lincoln-hs.test` and `grant-hs.test`; real schools have no domains yet, so their teachers go on a waitlist.
- `ALLOW_DEMO_SCHOOLS=true` shows the demo schools in a production build (previews, e2e).

## Deploying
See [DEPLOY.md](DEPLOY.md): Google Cloud Run + Neon Postgres, Resend, Google sign-in, Google Meet and Cloud Scheduler.

## Background jobs
Request expiry, 1-hour session reminders, ending Meet conferences after sessions, staff report alerts and
unread-message emails run from `GET /api/cron/all`; the staff hours digest from `GET /api/cron/hours-digest`.
Both need `Authorization: Bearer $CRON_SECRET`. In production, Cloud Scheduler calls them (every 5 minutes, plus the
weekday digest; see DEPLOY.md). Locally, run `npm run jobs` next to `npm run dev` (add `-- once` for a single run).
Every job is idempotent, so overlapping or repeated runs don't double-send.

## Scripts
| Script | What it does |
|---|---|
| `db:start` | Runs an embedded Postgres 17 (the `embedded-postgres` package) |
| `db:migrate` / `db:reset` | Prisma migrate dev / reset (reset re-runs the seed) |
| `db:seed` | Wipes and reseeds the catalog plus the demo world (local databases only) |
| `db:seed:catalog` | Production-safe: adds missing schools, courses, slots and staff domains |
| `db:deploy` | Applies migrations (production) |
| `jobs` | Runs the background jobs against the local app every minute |
| `test` | Vitest unit + integration tests (needs `db:start`; uses a separate `tierup_test` database) |
| `typecheck`, `lint`, `build` | The usual |

## Layout
```
prisma/            schema.prisma, migrations/, seed/
src/app/           routes ((public) landing, onboarding, (app) logged-in screens, api/)
src/components/ui/ design-system primitives (Card, Button, Tag, Toast, …)
src/server/        db client, services (business rules), policies, integrations
src/lib/           shared utilities (school-local time, …)
```

## Demo data
Demo users live at the fictional **Lincoln High School (Demo)** and **Grant High School (Demo)** and use `.test` email addresses. Upcoming sessions are seeded relative to the day you run the seed, so they always land in the next week.
