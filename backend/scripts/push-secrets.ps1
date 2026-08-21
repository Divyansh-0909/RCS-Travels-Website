# Pushes the backend's secrets into Google Secret Manager, and grants the Cloud
# Run service account permission to read them.
#
#   cd backend
#   .\scripts\push-secrets.ps1                     # reads .env.production
#   .\scripts\push-secrets.ps1 -File .env          # or somewhere else
#   .\scripts\push-secrets.ps1 -DryRun             # show what WOULD be pushed
#
# SOURCE THE VALUES FROM RENDER, NOT FROM YOUR LAPTOP. backend/.env is a
# development config — its Clerk keys are sk_test_/pk_test_, which point at a
# separate user pool holding none of the real riders or captains, so pushing them
# would give Cloud Run a Clerk instance that works perfectly and has no users.
# The authoritative production values are in the Render dashboard under
# Service -> Environment. Copy them into .env.production, which .gitignore already
# excludes via `.env.*`.
#
# Object storage is NOT here any more. Driver documents moved to Google Cloud
# Storage, which has no key to push: the runtime authenticates as its attached
# service account and GCS_BUCKET is a plain env var on the service.
#
# NO VALUE IS EVER PRINTED, and none is ever passed as a command-line argument —
# arguments are visible to any other process on the machine via the process list,
# which is the usual way a secret leaks from a script like this. Each value is
# written to a temp file with exact bytes and handed to gcloud as --data-file.
#
# Idempotent. A secret that already exists gets a NEW VERSION rather than an
# error, so re-running after rotating one key is the normal way to use this.

param(
    [string]$File = ".env.production",
    [string]$Project = "project-0c9e66c4-03f9-4cc0-b53",
    [string]$ServiceAccount = "rcs-api@project-0c9e66c4-03f9-4cc0-b53.iam.gserviceaccount.com",
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

# What the RUNNING SERVICE reads. Deliberately not "everything in the file".
#
# DIRECT_URL is absent on purpose: it is only used by `prisma migrate` and
# `prisma studio`, which run from a laptop, never inside the container. Shipping
# it would put a direct, un-pooled database credential into the runtime for no
# reason.
#
# PORT, CORS_ORIGINS, JOBS_MODE, NODE_ENV, DATABASE_POOL_MAX and the
# INTERNAL_JOBS_* pair are also absent: none of them is a secret, and they are
# set as plain environment variables on the service where they can be read at a
# glance.
$SECRET_KEYS = @(
    "DATABASE_URL",
    "CLERK_SECRET_KEY",
    "CLERK_PUBLISHABLE_KEY",
    "FARE_QUOTE_SECRET",
    "GOOGLE_MAPS_API_KEY",
    "FIREBASE_SERVICE_ACCOUNT_BASE64",
    "WHATSAPP_PHONE_NUMBER_ID",
    "WHATSAPP_ACCESS_TOKEN",
    "WHATSAPP_VERIFY_TOKEN",
    "WHATSAPP_APP_SECRET",
    "ADMIN_PHONE"
)

# DELIBERATELY ABSENT: MSG91_AUTH_KEY, MSG91_TEMPLATE_ID.
# Checked against the source — nothing in routes/, services/, lib/ or middleware/
# reads any of them. MSG91 was an SMS provider the OTP flow no longer uses, and
# the verify token belongs to a webhook that was never wired up. Pushing them
# would create Secret Manager entries nobody reads, which later look like
# something that matters. Add them back when there is code behind them.

# Without these the container does not start at all — see lib/supabase.js and
# services/fareQuote.js, both of which throw at import when NODE_ENV=production.
# Called out separately so a missing one is an obvious failure here rather than a
# crash loop in Cloud Run twenty minutes later.
$BOOT_CRITICAL = @("DATABASE_URL", "CLERK_SECRET_KEY", "FARE_QUOTE_SECRET")

if (-not (Test-Path $File)) {
    Write-Output "No such file: $File"
    Write-Output ""
    Write-Output "Create it from Render (Service -> Environment), e.g.:"
    Write-Output "    DATABASE_URL=postgresql://..."
    Write-Output "    FARE_QUOTE_SECRET=..."
    Write-Output "It is gitignored by the existing .env.* rule."
    exit 1
}

# Parsed by hand rather than with a dotenv library: this script has to run before
# anything is installed, and the format it needs to understand is three lines of
# rules. Splits on the FIRST '=' only, because base64 blobs and connection
# strings contain plenty more.
$values = @{}
foreach ($line in Get-Content $File) {
    $trimmed = $line.Trim()
    if ($trimmed -eq "" -or $trimmed.StartsWith("#")) { continue }
    $i = $trimmed.IndexOf("=")
    if ($i -lt 1) { continue }

    $key = $trimmed.Substring(0, $i).Trim()
    $val = $trimmed.Substring($i + 1).Trim()

    # Strip one layer of surrounding quotes if present.
    if ($val.Length -ge 2) {
        if (($val.StartsWith('"') -and $val.EndsWith('"')) -or ($val.StartsWith("'") -and $val.EndsWith("'"))) {
            $val = $val.Substring(1, $val.Length - 2)
        }
    }
    $values[$key] = $val
}

$pushed = @()
$skipped = @()

foreach ($key in $SECRET_KEYS) {
    $val = $values[$key]

    if ([string]::IsNullOrWhiteSpace($val)) {
        $skipped += $key
        continue
    }

    if ($DryRun) {
        Write-Output "would push  $key  ($($val.Length) chars)"
        $pushed += $key
        continue
    }

    # Exact bytes, no trailing newline and no BOM. This matters more than it
    # looks: PowerShell's pipeline and Out-File both append a CRLF, and a
    # DATABASE_URL with a trailing newline produces a connection error that says
    # nothing about a newline.
    $tmp = [System.IO.Path]::GetTempFileName()
    try {
        [System.IO.File]::WriteAllText($tmp, $val, (New-Object System.Text.UTF8Encoding($false)))

        $exists = $null
        try { $exists = gcloud secrets describe $key --project $Project --format="value(name)" 2>$null } catch { }

        if ([string]::IsNullOrWhiteSpace($exists)) {
            gcloud secrets create $key --data-file=$tmp --replication-policy=automatic --project $Project | Out-Null
            Write-Output "created  $key"
        }
        else {
            gcloud secrets versions add $key --data-file=$tmp --project $Project | Out-Null
            Write-Output "updated  $key  (new version)"
        }

        # Granted per secret rather than project-wide, so the service account can
        # read exactly these and nothing else that lands in Secret Manager later.
        gcloud secrets add-iam-policy-binding $key `
            --member="serviceAccount:$ServiceAccount" `
            --role="roles/secretmanager.secretAccessor" `
            --project $Project | Out-Null

        $pushed += $key
    }
    finally {
        # Always, including on a failure part-way through. A secret sitting in
        # %TEMP% is the thing this whole script is trying to avoid.
        Remove-Item $tmp -Force -ErrorAction SilentlyContinue
    }
}

Write-Output ""
Write-Output "pushed:  $($pushed.Count)"
if ($skipped.Count) { Write-Output "skipped (empty in $File): $($skipped -join ', ')" }

$missingCritical = $BOOT_CRITICAL | Where-Object { $pushed -notcontains $_ }
if ($missingCritical.Count) {
    Write-Output ""
    Write-Output "!! THE CONTAINER WILL NOT START without these:"
    Write-Output "   $($missingCritical -join ', ')"
    Write-Output "   lib/supabase.js and services/fareQuote.js throw at import when"
    Write-Output "   NODE_ENV=production. Fill them in $File and re-run."
    exit 1
}

Write-Output ""
Write-Output "All boot-critical secrets are present."
