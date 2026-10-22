# Deploying TierUp to Google Cloud

**Setup:** Cloud Run (app, `us-east4`) + Supabase (Postgres) + Resend (email) +
Cloud Scheduler (background jobs) + Cloud Build (deploys on every push to `main`).

Work through the steps in order; each command is copy-paste. You need the
[gcloud CLI](https://cloud.google.com/sdk/docs/install) (`gcloud init`, then `gcloud auth login`).
You don't need Docker on your machine: Cloud Build builds the image.

The app refuses to start in production if a required setting is missing, and lists what to fix in the
Cloud Run logs.

```bash
# Used throughout. Pick a project ID (lowercase, globally unique).
export PROJECT_ID=tierup-prod
export REGION=us-east4
```

---

## 1. Supabase (database)

1. Create a project on a paid plan (daily backups, no pausing), region **East US (North Virginia)**,
   close to `us-east4`. Sign Supabase's DPA in the dashboard; schools will ask, since we store minors' data.
2. **Connect → Connection string**, copy two URLs (both use the pooler host):
   - **Transaction pooler** (port **6543**) → `DATABASE_URL`, ending in `?pgbouncer=true&connection_limit=1`
   - **Session pooler** (port **5432**) → `DIRECT_URL`
   Don't use the "Direct connection" string: it's IPv6-only unless you buy Supabase's IPv4 add-on, and
   Cloud Build/Cloud Run connect over IPv4.
3. TierUp doesn't use Supabase Auth, Storage or Realtime; leave them off. Access rules are enforced in
   the app's server code.
4. Create the schema and load the catalog from your machine:

```bash
DATABASE_URL="<transaction pooler>" DIRECT_URL="<session pooler>" npm run db:deploy          # migrations
DATABASE_URL="<transaction pooler>" DIRECT_URL="<session pooler>" npm run db:seed:catalog    # 64 schools, 80 courses, slots, staff domains
```

`db:seed:catalog` is safe to re-run (it only adds what's missing). Never run `npm run db:seed` here: it
wipes the database, and it refuses non-local hosts.

## 2. Google Cloud project

```bash
gcloud projects create $PROJECT_ID          # or use an existing project
gcloud config set project $PROJECT_ID
# Link a billing account in the console (Billing). New accounts get $300 credit.

gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
  secretmanager.googleapis.com cloudscheduler.googleapis.com iamcredentials.googleapis.com \
  calendar-json.googleapis.com meet.googleapis.com

gcloud artifacts repositories create tierup --repository-format=docker --location=$REGION

export PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')
export APP_URL="https://tierup-$PROJECT_NUMBER.$REGION.run.app"   # the Cloud Run URL (deterministic)
echo $APP_URL
```

## 3. Secrets

```bash
secret() { printf '%s' "$2" | gcloud secrets create "$1" --data-file=- --replication-policy=automatic; }

secret DATABASE_URL       "<Supabase transaction pooler URL>"
secret DIRECT_URL         "<Supabase session pooler URL>"
secret AUTH_SECRET        "$(openssl rand -base64 33)"
secret AUTH_GOOGLE_SECRET "<Google OAuth client secret>"
secret RESEND_API_KEY     "<Resend API key>"          # §6
secret CRON_SECRET        "$(openssl rand -hex 24)"
```

To change one later: `printf '%s' "new value" | gcloud secrets versions add NAME --data-file=-`, then redeploy.

## 4. Service accounts

```bash
# The app runs as tierup-run; Cloud Build deploys as tierup-build.
gcloud iam service-accounts create tierup-run --display-name="TierUp app"
gcloud iam service-accounts create tierup-build --display-name="TierUp deploys"
RUN_SA=tierup-run@$PROJECT_ID.iam.gserviceaccount.com
BUILD_SA=tierup-build@$PROJECT_ID.iam.gserviceaccount.com

for s in DATABASE_URL AUTH_SECRET AUTH_GOOGLE_SECRET RESEND_API_KEY CRON_SECRET; do
  gcloud secrets add-iam-policy-binding $s --member=serviceAccount:$RUN_SA --role=roles/secretmanager.secretAccessor
done
for s in DATABASE_URL DIRECT_URL; do
  gcloud secrets add-iam-policy-binding $s --member=serviceAccount:$BUILD_SA --role=roles/secretmanager.secretAccessor
done
for r in roles/run.admin roles/artifactregistry.writer roles/logging.logWriter; do
  gcloud projects add-iam-policy-binding $PROJECT_ID --member=serviceAccount:$BUILD_SA --role=$r
done
gcloud iam service-accounts add-iam-policy-binding $RUN_SA --member=serviceAccount:$BUILD_SA --role=roles/iam.serviceAccountUser
```

## 5. Google sign-in

In the Google Cloud console project that holds your OAuth client → **APIs & Services → Credentials →
your OAuth client → Authorized redirect URIs**, add `$APP_URL/api/auth/callback/google`.
Before launch, **publish** the OAuth consent screen (in "Testing" only listed test users can sign in).

## 6. Resend (email)

Verify your sending domain (SPF/DKIM DNS records) and create an API key (the `RESEND_API_KEY` secret).
`EMAIL_FROM` must use that domain, e.g. `TierUp <noreply@yourdomain.org>`.

## 7. First deploy

```bash
# Build the image once by hand…
gcloud builds submit --region=$REGION --tag $REGION-docker.pkg.dev/$PROJECT_ID/tierup/app:first .

# …then create the service with its full configuration.
gcloud run deploy tierup --region=$REGION \
  --image=$REGION-docker.pkg.dev/$PROJECT_ID/tierup/app:first \
  --service-account=tierup-run@$PROJECT_ID.iam.gserviceaccount.com \
  --allow-unauthenticated --min-instances=0 --max-instances=3 --memory=512Mi \
  --set-secrets=DATABASE_URL=DATABASE_URL:latest,AUTH_SECRET=AUTH_SECRET:latest,AUTH_GOOGLE_SECRET=AUTH_GOOGLE_SECRET:latest,RESEND_API_KEY=RESEND_API_KEY:latest,CRON_SECRET=CRON_SECRET:latest \
  --set-env-vars="APP_URL=$APP_URL,AUTH_GOOGLE_ID=<client id>,EMAIL_FROM=TierUp <noreply@yourdomain.org>,MEET_PROVIDER=fake,ALLOW_FAKE_MEET=true,ADMIN_EMAILS=you@yourdomain.org"
```

`PARENT_CONSENT` is off by default: only teacher approval gates tutoring, and no parent emails are sent.
Set `PARENT_CONSENT=true` to bring back the consent step, banners, parent emails and consent checks.

`TUTOR_APPROVAL_REMINDER_DAYS` (default 3; `0` turns it off) sets how long a tutor-approval request waits,
after it becomes approvable, before the endorsing teacher gets one reminder email.

`ADMIN_EMAILS` lists who can open `/admin` (schools, staff email domains, the waitlist). For several
admins, gcloud needs a different list separator because it splits on commas:
`gcloud run services update tierup --region=$REGION --update-env-vars="^;^ADMIN_EMAILS=a@x.org,b@x.org"`.

Until Google Meet is set up (§10), `ALLOW_FAKE_MEET=true` lets the app run with placeholder Meet links.
**Treat it as a preview**: don't let real students book online sessions until §10 is done.

If the service doesn't start, read why: `gcloud run services logs read tierup --region=$REGION --limit=50`.

## 8. Deploy on every push to `main`

1. Console → **Cloud Build → Repositories (2nd gen) → Create host connection** → GitHub, then **Link repository**
   `mojdehgraznahan-sys/tierup`.
2. Create the trigger:

```bash
gcloud builds triggers create github --name=tierup-main --region=$REGION \
  --repository=projects/$PROJECT_ID/locations/$REGION/connections/<connection>/repositories/<repo> \
  --branch-pattern='^main$' --build-config=cloudbuild.yaml \
  --service-account=projects/$PROJECT_ID/serviceAccounts/tierup-build@$PROJECT_ID.iam.gserviceaccount.com
```

Each push to `main` then: applies migrations → builds the image → deploys it (`cloudbuild.yaml`).
Settings and secrets stay on the service; change them with
`gcloud run services update tierup --region=$REGION --update-env-vars=…` or `--update-secrets=…`.

## 9. Background jobs (Cloud Scheduler)

```bash
CRON_SECRET=$(gcloud secrets versions access latest --secret=CRON_SECRET)

gcloud scheduler jobs create http tierup-frequent --location=$REGION \
  --schedule="*/5 * * * *" --uri="$APP_URL/api/cron/all" --http-method=GET \
  --headers="Authorization=Bearer $CRON_SECRET" --attempt-deadline=120s

gcloud scheduler jobs create http tierup-hours-digest --location=$REGION \
  --schedule="0 7 * * 1-5" --time-zone="America/New_York" \
  --uri="$APP_URL/api/cron/hours-digest" --http-method=GET \
  --headers="Authorization=Bearer $CRON_SECRET"

gcloud scheduler jobs run tierup-frequent --location=$REGION   # try it now
```

The frequent job covers session reminders, request expiry, ending Meets, report alerts and unread-message
emails. Every job is idempotent. Note the secret is stored in the job's config, which project admins can see.

## 10. Google Meet (one-time links, keyless)

Needs a **Google Workspace** account that owns the meeting events (open question #3).

```bash
gcloud iam service-accounts create tierup-meet --display-name="TierUp Meet organizer"
MEET_SA=tierup-meet@$PROJECT_ID.iam.gserviceaccount.com
# Let the app sign as tierup-meet (no key file anywhere):
gcloud iam service-accounts add-iam-policy-binding $MEET_SA \
  --member=serviceAccount:tierup-run@$PROJECT_ID.iam.gserviceaccount.com --role=roles/iam.serviceAccountTokenCreator
gcloud iam service-accounts describe $MEET_SA --format='value(oauth2ClientId)'   # numeric client ID
```

1. Workspace Admin console → **Security → API controls → Domain-wide delegation → Add new**: the numeric
   client ID above, scopes
   `https://www.googleapis.com/auth/calendar.events,https://www.googleapis.com/auth/meetings.space.created`.
2. Switch the app over:

```bash
gcloud run services update tierup --region=$REGION \
  --update-env-vars="MEET_PROVIDER=google,GOOGLE_MEET_SERVICE_ACCOUNT=$MEET_SA,GOOGLE_MEET_ORGANIZER=sessions@yourdomain.org" \
  --remove-env-vars=ALLOW_FAKE_MEET
```

3. Book a test online session and check: both students get a calendar invite, the link opens, and an
   uninvited account has to knock. (This path is built but hasn't been run against live Google yet.)

## 11. Later: move to Cloud SQL (optional)

If you want everything inside GCP: create a Cloud SQL for PostgreSQL 17 instance in `us-east4` with
automated backups, restore a `pg_dump` from Supabase, point the `DATABASE_URL`/`DIRECT_URL` secrets at it
(Cloud SQL connector, `--add-cloudsql-instances` on the service) and redeploy. Migrations in Cloud Build
then need the Cloud SQL Auth Proxy step. It's a short, planned cutover.

## 12. Custom domain

The `run.app` URL works for a pilot. For your own domain, use Cloud Run domain mappings if they're
available in `us-east4`, otherwise Firebase Hosting (rewrite to the Cloud Run service) or a global
external load balancer. Then update `APP_URL`, the OAuth redirect URI and the Scheduler job URLs.

## Launch check

- [ ] Sign in with Google and with an email link on the live URL
- [ ] A test student completes onboarding; the parent consent email arrives and the link works
- [ ] A teacher with the school's domain signs up as staff
- [ ] Book an in-person session (and an online one once §10 is done); check the emails
- [ ] `gcloud scheduler jobs run tierup-frequent` → Cloud Run logs show `/api/cron/all` 200
- [ ] A push to `main` triggers a green Cloud Build run

## Cost at pilot scale (rough)

Cloud Run, Cloud Build, Scheduler (3 jobs free), Artifact Registry and Secret Manager: about **$0–2/month**.
Supabase: your plan's price. Resend free tier: 3,000 emails/month.
