# Deploying the API to Cloud Run

Runbook. `REGION` is `asia-south1` because Supabase is on `aws-1-ap-south-1` —
also Mumbai, so this keeps the database round trip in the same city.

```powershell
$PROJECT = "project-0c9e66c4-03f9-4cc0-b53"
$REGION  = "asia-south1"
$SERVICE = "rcs-api"
```

The project ID is unlovely (it was auto-created as "My First Project") but it is
the one that holds billing and all four Maps APIs — `places`,
`geocoding-backend`, `routes` and `maps-backend`. Moving those to a
better-named project would mean a new API key and updating it across the
backend, Vercel and the Expo app, for cosmetics. The display name can be changed
freely; the ID cannot.

---

## 1. One-time project setup — DONE

Recorded for reproducibility; all of this already exists.

```powershell
gcloud config set project $PROJECT
gcloud config set run/region $REGION

gcloud services enable `
  run.googleapis.com `
  cloudbuild.googleapis.com `
  artifactregistry.googleapis.com `
  secretmanager.googleapis.com `
  cloudscheduler.googleapis.com
```

### Artifact Registry, with a cleanup policy

The repository is named `cloud-run-source-deploy` because that is the name
`gcloud run deploy --source` uses by default — creating it ahead of time in the
right region means the deploy reuses it instead of making a second one.

The free tier is 0.5 GB and each image is roughly 200 MB, so without a policy
this becomes a small monthly bill for images nobody will ever roll back to.

```powershell
gcloud artifacts repositories create cloud-run-source-deploy `
  --repository-format=docker --location=$REGION `
  --description="Images built by gcloud run deploy --source"

gcloud artifacts repositories set-cleanup-policies cloud-run-source-deploy `
  --location=$REGION --policy=cleanup-policy.json
```

See `backend/cleanup-policy.json` — keep the 3 most recent, delete anything over
30 days. Keep wins over Delete where both match.

---

## 2. Service accounts — DONE

Two, because the thing that *runs* and the thing that *triggers* should not be
the same identity. If the scheduler account is ever compromised it should be able
to start a sweep and nothing else — and `middleware/internalAuth.js` compares the
caller against exactly one address, which only means something if that address is
not also the service's own.

```powershell
gcloud iam service-accounts create rcs-api       --display-name="RCS API (Cloud Run runtime)"
gcloud iam service-accounts create rcs-scheduler --display-name="RCS Cloud Scheduler (job triggers)"
```

Resulting identities:

- `rcs-api@project-0c9e66c4-03f9-4cc0-b53.iam.gserviceaccount.com`
- `rcs-scheduler@project-0c9e66c4-03f9-4cc0-b53.iam.gserviceaccount.com`

---

## 2b. The document bucket — DONE

Driver documents live in Google Cloud Storage. Private, and it must stay that way:
these are captains' licences, insurance certificates and photographs of their
faces.

```powershell
gcloud storage buckets create gs://rcs-travels-driver-documents `
  --location=$REGION --uniform-bucket-level-access --public-access-prevention

# Scoped to this ONE bucket, not the project.
gcloud storage buckets add-iam-policy-binding gs://rcs-travels-driver-documents `
  --member="serviceAccount:rcs-api@$PROJECT.iam.gserviceaccount.com" `
  --role="roles/storage.objectAdmin"
```

### The grant everybody forgets

```powershell
gcloud iam service-accounts add-iam-policy-binding `
  rcs-api@$PROJECT.iam.gserviceaccount.com `
  --member="serviceAccount:rcs-api@$PROJECT.iam.gserviceaccount.com" `
  --role="roles/iam.serviceAccountTokenCreator"
```

The service account granting a role **to itself** looks like a mistake and is not.
Cloud Run holds no private key, so the library cannot sign a V4 URL locally — it
signs through the IAM `signBlob` API instead, which requires the caller to be a
token creator for the identity it is signing as. Without this, every
`signedUploadUrl` and `signedReadUrl` fails with a permission error that mentions
nothing about signing, and the only visible symptom is that captains cannot
upload documents and admins cannot open them.

`GCS_BUCKET` is a plain environment variable, not a secret — a bucket name is not
a credential, and there is deliberately no key to store.

---

## 3. Secrets

Never in the image, never in `--set-env-vars`. Environment variables set at
deploy time are visible to anyone with `run.services.get` and appear in the
service YAML; Secret Manager values are not, and are versioned.

### Source the values from Render, not from your laptop

`backend/.env` is a **development** config — its Clerk keys are `sk_test_`/`pk_test_`,
which point at a completely separate user pool containing none of your real riders
or captains. Push those and Cloud Run authenticates happily against an empty
instance. The authoritative production values live in the Render dashboard under
**Service → Environment** (until Render is retired; after that, Secret Manager is
the only copy).

Copy them into `backend/.env.production` (already gitignored by the `.env.*`
rule), then:

```powershell
cd backend
.\scripts\push-secrets.ps1 -DryRun     # see what would be pushed, no values printed
.\scripts\push-secrets.ps1             # create/version each secret + grant rcs-api access
```

The script never prints a value and never passes one as a command-line argument
(arguments are readable from the process list). It writes exact bytes to a temp
file, hands gcloud `--data-file`, and deletes it in a `finally`. Re-running after
rotating a key adds a new version rather than failing.

It exits non-zero if any boot-critical secret is missing — `DATABASE_URL`,
`CLERK_SECRET_KEY`, `FARE_QUOTE_SECRET` —
so a missing one is caught here rather than as a Cloud Run crash loop.

**`DATABASE_URL` must be the Supabase session pooler URI.** Direct connections
are IPv6-only on new projects and Cloud Run's egress will not reach them.
`DIRECT_URL` is deliberately **not** pushed: it is read only by `prisma migrate`
and `studio`, which run from a laptop, so shipping it would put an un-pooled
database credential into the runtime for nothing.

---

## 4. Deploy

No local Docker required — Cloud Build builds the Dockerfile in Google's
infrastructure.

### First, a one-time IAM grant that is not optional

`gcloud run deploy --source` uploads the source to a staging bucket and hands the
build to **Cloud Build**, which runs as the project's *default compute* service
account. On projects created after Google tightened defaults, that account has no
roles at all, so the first deploy fails with:

```
Error 403: …-compute@developer.gserviceaccount.com does not have
storage.objects.get access to the Google Cloud Storage object
```

It is not a problem with the Dockerfile or the service account we created — the
builder cannot read the zip it was just given. One grant fixes it permanently:

```powershell
gcloud projects add-iam-policy-binding $PROJECT `
  --member="serviceAccount:PROJECT_NUMBER-compute@developer.gserviceaccount.com" `
  --role="roles/cloudbuild.builds.builder" --condition=None
```

`roles/cloudbuild.builds.builder` is the composite role covering exactly this:
read the source bucket, push to Artifact Registry, write build logs. The runtime
identity is still `rcs-api` — the compute account only ever builds.

```powershell
gcloud run deploy $SERVICE `
  --source . `
  --region $REGION `
  --service-account "rcs-api@$PROJECT.iam.gserviceaccount.com" `
  --min-instances 0 `
  --max-instances 4 `
  --memory 1Gi `
  --cpu 1 `
  --timeout 600 `
  --concurrency 40 `
  --allow-unauthenticated `
  --set-env-vars "CORS_ORIGINS=https://rcstravels.vercel.app" `
  --set-env-vars "GCS_BUCKET=rcs-travels-driver-documents" `
  --set-secrets "DATABASE_URL=DATABASE_URL:latest,CLERK_SECRET_KEY=CLERK_SECRET_KEY:latest,CLERK_PUBLISHABLE_KEY=CLERK_PUBLISHABLE_KEY:latest,FARE_QUOTE_SECRET=FARE_QUOTE_SECRET:latest,GOOGLE_MAPS_API_KEY=GOOGLE_MAPS_API_KEY:latest,FIREBASE_SERVICE_ACCOUNT_BASE64=FIREBASE_SERVICE_ACCOUNT_BASE64:latest,WHATSAPP_ACCESS_TOKEN=WHATSAPP_ACCESS_TOKEN:latest,WHATSAPP_PHONE_NUMBER_ID=WHATSAPP_PHONE_NUMBER_ID:latest,ADMIN_PHONE=ADMIN_PHONE:latest"
```

Why these numbers:

| Flag | Value | Reason |
|---|---|---|
| `--min-instances` | `0` | Nothing needs to be resident. The sweeps are scheduler-driven, so there is no timer to keep alive. |
| `--max-instances` | `4` | Bounds the database pool at 4 x `DATABASE_POOL_MAX` (5) = 20 connections. Raising one means lowering the other. |
| `--memory` | `1Gi` | sharp decoding a 10 MB PDF page or a 50 MP image needs real headroom. 512 MB is where the scan sweep starts dying mid-batch. |
| `--timeout` | `600` | The scan sweep can work through 20 documents sequentially; the 300 s default would cut it off. |
| `--concurrency` | `40` | Default is 80. Halved because each in-flight request can hold a pool connection, and the pool is 5. |
| `--allow-unauthenticated` | | The public API — Clerk does the authenticating. `/internal` is separately protected by OIDC. |

`NODE_ENV=production` and `JOBS_MODE=scheduler` are baked into the Dockerfile, so
they cannot be forgotten here.

---

## 5. Cloud Scheduler

Three jobs — exactly the free-tier allowance. Their names must match the keys in
`lib/jobs.js`; a mismatch stops that sweep with nothing failing anywhere visible.

```powershell
$URL = gcloud run services describe $SERVICE --region $REGION --format="value(status.url)"

# Let Scheduler invoke the service.
gcloud run services add-iam-policy-binding $SERVICE --region $REGION `
  --member="serviceAccount:rcs-scheduler@$PROJECT.iam.gserviceaccount.com" `
  --role="roles/run.invoker"

# dispatch — offer unfilled scheduled rides. Every 5 minutes.
gcloud scheduler jobs create http rcs-dispatch `
  --location=$REGION --schedule="*/5 * * * *" `
  --uri="$URL/internal/jobs/dispatch" --http-method=POST `
  --oidc-service-account-email="rcs-scheduler@$PROJECT.iam.gserviceaccount.com" `
  --oidc-token-audience="$URL" `
  --attempt-deadline=300s

# document-scan — verify uploads nothing settled. Every 5 minutes.
gcloud scheduler jobs create http rcs-document-scan `
  --location=$REGION --schedule="*/5 * * * *" `
  --uri="$URL/internal/jobs/document-scan" --http-method=POST `
  --oidc-service-account-email="rcs-scheduler@$PROJECT.iam.gserviceaccount.com" `
  --oidc-token-audience="$URL" `
  --attempt-deadline=300s

# document-expiry — lapse and remind. Hourly.
gcloud scheduler jobs create http rcs-document-expiry `
  --location=$REGION --schedule="0 * * * *" `
  --uri="$URL/internal/jobs/document-expiry" --http-method=POST `
  --oidc-service-account-email="rcs-scheduler@$PROJECT.iam.gserviceaccount.com" `
  --oidc-token-audience="$URL" `
  --attempt-deadline=300s
```

Then set the two variables the endpoints check, and redeploy:

```powershell
gcloud run services update $SERVICE --region $REGION `
  --set-env-vars "CORS_ORIGINS=https://rcstravels.vercel.app,INTERNAL_JOBS_AUDIENCE=$URL,INTERNAL_JOBS_SERVICE_ACCOUNT=rcs-scheduler@$PROJECT.iam.gserviceaccount.com"
```

Until those are set, `/internal` answers 503 to everything — it fails closed by
design, so the scheduler jobs will show failures until this step is done. That is
expected, not a bug.

---

## 6. Migrations

**Not run by the container, deliberately.** Cloud Run can start several instances
at once, and a migration on boot would mean several concurrent `migrate deploy`
runs racing for the advisory lock while the startup probe waits on them. It is a
one-off action, so it is run as one:

```powershell
cd backend
npm run db:deploy      # uses DIRECT_URL from your local .env
```

Run it *before* deploying a release whose code depends on the new schema.

---

## 7. Verify

```powershell
$URL = gcloud run services describe $SERVICE --region $REGION --format="value(status.url)"

curl.exe -s "$URL/health"                                   # {"status":"ok","db":"ok"}
curl.exe -s -X POST "$URL/internal/jobs/dispatch"            # 401 — no token
gcloud scheduler jobs run rcs-dispatch --location=$REGION    # should succeed
gcloud run services logs read $SERVICE --region $REGION --limit 50
```

`{"db":"ok"}` is the one that matters — it proves the pooler is reachable from
Cloud Run's egress, which is the single most likely thing to be wrong on a first
deploy.
