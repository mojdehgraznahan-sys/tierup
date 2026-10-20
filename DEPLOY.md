# Deploying TierUp

Target setup: **Vercel** (app) + **Supabase** (Postgres) + **Resend** (email) + **GitHub Actions** (5-minute jobs).
Work through the steps in order. Each one says what to copy where.

The app refuses to start in production if a required setting is missing, and it prints the list of
what to fix in the Vercel function logs.

---

## 1. Supabase (database)

1. Create a project: **Pro plan** (daily backups, no pausing), region **US East (N. Virginia)**.
   Sign Supabase's DPA in the dashboard; schools will ask about it since we store minors' data.
2. **Project Settings → Database → Connection string**, copy two URLs:
   - **Transaction pooler** (port **6543**) → `DATABASE_URL`, and append `?pgbouncer=true&connection_limit=1`
   - **Direct connection** (port **5432**) → `DIRECT_URL`
3. TierUp doesn't use Supabase Auth, Storage or Realtime, so leave them off. Access rules are enforced in
   the app's server code.

## 2. Create the schema and load the catalog

From your machine, with the two URLs from step 1:

```bash
DATABASE_URL="<pooler url>" DIRECT_URL="<direct url>" npm run db:deploy        # apply migrations
DATABASE_URL="<pooler url>" DIRECT_URL="<direct url>" npm run db:seed:catalog  # 64 schools, 80 courses, slots, staff domains
```

`db:seed:catalog` is safe to re-run; it only adds what's missing. **Never run `npm run db:seed` against
production**; it wipes the database (it refuses to run against non-local hosts).

Staff email domains: add confirmed ones to `prisma/seed/schools.ts` (like Flint Hill's `flinthill.org`),
then re-run `db:seed:catalog`.

## 3. Resend (email)

1. Add and verify your sending domain (DNS records: SPF, DKIM).
2. Create an API key → `RESEND_API_KEY`.
3. `EMAIL_FROM`, e.g. `TierUp <noreply@yourdomain.org>` (must use the verified domain).

## 4. Google sign-in

In Google Cloud Console → your OAuth client → **Authorized redirect URIs**, add
`https://<your domain>/api/auth/callback/google`. Keep the localhost one for development.
Before launch, the OAuth consent screen must be **published** (not "Testing"), or only test users can sign in.

## 5. Vercel

1. Import the GitHub repo. Framework: Next.js. The build uses the `vercel-build` script automatically:
   it runs `prisma migrate deploy` **only for production deploys**, then builds.
2. **Settings → Environment Variables** (Production):

| Variable | Value |
|---|---|
| `DATABASE_URL` | Supabase pooler URL (+ `?pgbouncer=true&connection_limit=1`) |
| `DIRECT_URL` | Supabase direct URL |
| `AUTH_SECRET` | `npx auth secret` (or `openssl rand -base64 33`) |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | from Google Cloud |
| `APP_URL` | `https://<your domain>` |
| `EMAIL_FROM`, `RESEND_API_KEY` | from step 3 |
| `CRON_SECRET` | `openssl rand -hex 24` |
| `MEET_PROVIDER` | `google` (see step 7); until then a preview needs `ALLOW_FAKE_MEET=true` |

3. Add your domain under **Settings → Domains**.

**Preview deployments**: point them at a *separate* Supabase project (or branch), never production.
For a demo preview you can set `ALLOW_DEMO_SCHOOLS=true`, `ALLOW_FAKE_MEET=true`, and seed it with
`ALLOW_DEMO_SEED=true npm run db:seed`.

## 6. Background jobs

- `vercel.json` runs the **daily** jobs (hours digest on weekdays at 11:00 UTC, plus a daily catch-up run).
  These work on any Vercel plan.
- The **every-5-minutes** jobs (session reminders, request expiry, ending Meets, report alerts, unread-message
  emails) run from GitHub Actions: `.github/workflows/cron.yml`. In GitHub → repo **Settings → Secrets and
  variables → Actions**, add `APP_URL` and `CRON_SECRET` (same value as in Vercel).
  GitHub may delay scheduled runs by a few minutes at busy times; on Vercel Pro you can move the
  `*/5 * * * *` schedule into `vercel.json` instead.

## 7. Google Meet (one-time links)

Needs a **Google Workspace** account that owns the meeting events (open question #3: TierUp's own
Workspace, or each school's).

1. Google Cloud: enable the **Google Calendar API** and **Google Meet REST API**; create a **service account**
   and a JSON key.
2. Workspace Admin → Security → API controls → **Domain-wide delegation**: add the service account's client ID
   with scopes `https://www.googleapis.com/auth/calendar.events` and
   `https://www.googleapis.com/auth/meetings.space.created`.
3. Set `MEET_PROVIDER=google`, `GOOGLE_SERVICE_ACCOUNT_KEY` (`base64 -i key.json`), and
   `GOOGLE_MEET_ORGANIZER` (the Workspace user that owns the events, e.g. `sessions@yourdomain.org`).
4. Book one online test session and confirm: both students get a calendar invite, the Meet link opens, and
   a non-invited account has to knock.

## 8. Launch check

- [ ] Sign in with Google and with an email link on the live domain
- [ ] A test student completes onboarding; the parent consent email arrives and the link works
- [ ] A teacher with the school's domain signs up as staff
- [ ] Book an online and an in-person session; check the emails
- [ ] `curl -H "Authorization: Bearer $CRON_SECRET" https://<domain>/api/cron/all` returns `{"ok":true,…}`
- [ ] The GitHub Actions "Background jobs" workflow shows green runs
