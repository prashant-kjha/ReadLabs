# Deployment Guide

Step-by-step instructions to deploy ReadLabs for free using:

- **Frontend** → Cloudflare Pages at `readlabs.org`
- **Backend** → Google Cloud Run at `api.readlabs.org`
- **DB / Auth / Storage** → Supabase
- **AI** → Google Gemini

Total cost at low traffic: **$0/month** (plus your domain registration). Requires
a credit card on file at GCP (no charges within free tier).

> **Assumes you own `readlabs.org` via Cloudflare Registrar** (so DNS is already
> on Cloudflare). If your registrar is elsewhere, transfer the nameservers to
> Cloudflare first — it's free, takes ~5 min, and makes the custom-domain steps
> below one-click.

---

## Prerequisites

Create accounts (free) if you don't have them:

1. [GitHub](https://github.com/signup)
2. [Supabase](https://supabase.com/dashboard/sign-up)
3. [Cloudflare](https://dash.cloudflare.com/sign-up) — already done if you bought the domain there
4. [Google Cloud](https://console.cloud.google.com/) — credit card required at signup (no charges at free tier traffic)
5. [Google AI Studio](https://aistudio.google.com/) — for the Gemini API key

Install locally:

- [Google Cloud SDK (`gcloud`)](https://cloud.google.com/sdk/docs/install)
- [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started)
- [GitHub CLI (`gh`)](https://cli.github.com/) — optional but easier
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) — for the first manual Cloud Run deploy

---

## Part 1 — Push the repo to GitHub

```bash
# From the repo root
git remote add origin https://github.com/<your-username>/readlabs.git
git push -u origin main
```

If using GitHub CLI:

```bash
gh repo create readlabs --public --source=. --remote=origin --push
```

---

## Part 2 — Create the production Supabase project

1. Go to https://supabase.com/dashboard → **New project**
2. Name: `readlabs-prod`, generate a strong DB password (save it in a password manager)
3. Region: pick the one closest to your users
4. Plan: **Free**
5. Wait ~2 minutes for provisioning

**Apply the schema:**

```bash
# Link the local repo to the new project
supabase link --project-ref <your-project-ref>

# Push all migrations from supabase/migrations/ to prod
supabase db push
```

**Grab the keys** from Project Settings → API:

- `Project URL` — for `SUPABASE_URL`
- **Publishable** key (`sb_publishable_…`, or the legacy **anon / public** key on older projects) — for `VITE_SUPABASE_ANON_KEY` and `SUPABASE_ANON_KEY`
- **Secret** key (`sb_secret_…`, or the legacy **service_role / secret** key on older projects) — for `SUPABASE_SERVICE_ROLE_KEY` ⚠️ never expose this to the browser

> New Supabase projects use the `sb_publishable_…` / `sb_secret_…` key formats
> instead of the old JWT-style anon/service_role keys. They are drop-in
> replacements here — the backend only ever sends them as `apikey`/`Bearer`
> headers, and user-token verification uses the project's JWKS (asymmetric
> ES256) signing key, which both formats support.

**Create the PDF storage bucket** (Storage → New bucket):

- Name: `papers` — must match exactly (hardcoded in `routers/papers.py` and
  `routers/library.py`)
- **Public bucket: OFF** (private). The app serves PDFs via short-lived signed
  URLs, so a public bucket would leak every uploaded paper. Storage buckets are
  not created by SQL migrations, so this step is manual.

**Configure auth redirect URLs** (Authentication → URL Configuration):

- Site URL: `https://readlabs.org`
- Redirect URLs: add `https://readlabs.org/**`

---

## Part 3 — Get a Gemini API key

1. Visit https://aistudio.google.com/app/apikey
2. **Create API key** → choose your GCP project (or create a new one)
3. Copy the key — you'll paste it into Secret Manager in Part 5

The Gemini free tier gives you 15 RPM and 1M tokens/day on Gemini 2.5 Flash —
plenty for a demo.

---

## Part 4 — Deploy the frontend to Cloudflare Pages at readlabs.org

### 4.1 — Connect the repo

1. Cloudflare dashboard → **Workers & Pages** → **Create application** → **Pages** → **Connect to Git**
2. Authorize GitHub, pick your `readlabs` repo
3. Build configuration:
   - **Production branch**: `main`
   - **Framework preset**: `Vite`
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
   - **Root directory**: `frontend`
4. **Environment variables** (Production):
   - `VITE_SUPABASE_URL` = your Supabase project URL
   - `VITE_SUPABASE_ANON_KEY` = your Supabase anon key
   - `VITE_API_URL` = `https://api.readlabs.org` (the Cloud Run service we'll create in Part 5)
5. **Save and Deploy** — the first build runs immediately. It'll be reachable at the auto-generated `*.pages.dev` URL while we set up the custom domain.

### 4.2 — Attach the custom domain

1. Your Pages project → **Custom domains** → **Set up a custom domain**
2. Enter `readlabs.org`
3. Cloudflare auto-creates the DNS record (because the domain is on Cloudflare). Click confirm.
4. (Optional) Add `www.readlabs.org` as a second custom domain that redirects to the apex.

The custom domain is live within ~60 seconds. The site won't fully work until
Part 6 (the backend is missing), but the frontend loads and you can confirm
HTTPS, CSP, etc.

---

## Part 5 — Set up Google Cloud for the backend

### 5.1 — Create a GCP project + enable APIs

```bash
# Authenticate (opens a browser)
gcloud auth login

# Create the project (the ID must be globally unique; pick something with your name)
gcloud projects create readlabs-prod-<your-suffix> --name="ReadLabs"
gcloud config set project readlabs-prod-<your-suffix>

# Link a billing account (required even for free-tier services)
# Find your billing account ID:
gcloud billing accounts list
# Then:
gcloud billing projects link readlabs-prod-<your-suffix> --billing-account=<billing-account-id>

# Enable the APIs we'll use
gcloud services enable \
    run.googleapis.com \
    artifactregistry.googleapis.com \
    secretmanager.googleapis.com \
    iamcredentials.googleapis.com
```

### 5.2 — Create the Artifact Registry repo for Docker images

```bash
# Pick a region close to your users (us-central1 has the most generous free tier)
export REGION=us-central1
export PROJECT_ID=$(gcloud config get-value project)

gcloud artifacts repositories create readlabs \
    --repository-format=docker \
    --location=$REGION \
    --description="ReadLabs container images"
```

### 5.3 — Store secrets in Secret Manager

```bash
# Paste each secret when prompted (no leading/trailing whitespace)
printf "YOUR_SUPABASE_SERVICE_ROLE_KEY" | gcloud secrets create supabase-service-role-key --data-file=-
printf "YOUR_SUPABASE_ANON_KEY"          | gcloud secrets create supabase-anon-key         --data-file=-
printf "YOUR_GEMINI_API_KEY"             | gcloud secrets create gemini-api-key            --data-file=-
printf "YOUR_CORE_API_KEY_OR_EMPTY"      | gcloud secrets create core-api-key              --data-file=-
```

### 5.4 — Create the Cloud Run runtime service account

This is the identity the *running container* uses to access Secret Manager.

```bash
gcloud iam service-accounts create readlabs-runtime \
    --display-name="ReadLabs Cloud Run runtime"

export RUNTIME_SA="readlabs-runtime@${PROJECT_ID}.iam.gserviceaccount.com"

# Grant access to each secret
for SECRET in supabase-service-role-key supabase-anon-key gemini-api-key core-api-key; do
  gcloud secrets add-iam-policy-binding $SECRET \
      --member="serviceAccount:${RUNTIME_SA}" \
      --role="roles/secretmanager.secretAccessor"
done
```

### 5.5 — Set up Workload Identity Federation for GitHub Actions

This lets GitHub Actions deploy to GCP without storing a long-lived service-account
JSON in GitHub secrets — Actions gets a short-lived token at deploy time.

```bash
export GITHUB_USER=<your-github-username>
export GITHUB_REPO=readlabs

# Create the deploy service account
gcloud iam service-accounts create gh-deployer \
    --display-name="GitHub Actions deployer"

export DEPLOY_SA="gh-deployer@${PROJECT_ID}.iam.gserviceaccount.com"

# Permissions: push to Artifact Registry + deploy to Cloud Run + act as runtime SA
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:${DEPLOY_SA}" --role="roles/run.admin"
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:${DEPLOY_SA}" --role="roles/artifactregistry.writer"
gcloud iam service-accounts add-iam-policy-binding $RUNTIME_SA \
    --member="serviceAccount:${DEPLOY_SA}" --role="roles/iam.serviceAccountUser"

# Create the Workload Identity Pool + Provider
gcloud iam workload-identity-pools create "github-pool" \
    --location="global" \
    --display-name="GitHub Actions pool"

gcloud iam workload-identity-pools providers create-oidc "github-provider" \
    --location="global" \
    --workload-identity-pool="github-pool" \
    --display-name="GitHub OIDC" \
    --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.actor=assertion.actor" \
    --attribute-condition="assertion.repository == '${GITHUB_USER}/${GITHUB_REPO}'" \
    --issuer-uri="https://token.actions.githubusercontent.com"

# Allow the GitHub repo to impersonate the deploy SA
export POOL_ID=$(gcloud iam workload-identity-pools describe github-pool --location=global --format='value(name)')

gcloud iam service-accounts add-iam-policy-binding $DEPLOY_SA \
    --role="roles/iam.workloadIdentityUser" \
    --member="principalSet://iam.googleapis.com/${POOL_ID}/attribute.repository/${GITHUB_USER}/${GITHUB_REPO}"

# Print the provider resource name — you'll paste this into GitHub
gcloud iam workload-identity-pools providers describe github-provider \
    --location=global --workload-identity-pool=github-pool \
    --format='value(name)'
```

### 5.6 — First manual deploy (bootstraps the Cloud Run service)

Before GitHub Actions can deploy, the Cloud Run service must exist. We do one
manual deploy with the real config — `ALLOWED_ORIGINS` is already known
(`https://readlabs.org`) because the domain is fixed.

> **No Docker installed locally?** Skip the build/push steps below and let Cloud
> Build build the image from source in a single command (requires
> `cloudbuild.googleapis.com` enabled, which `gcloud services enable` in 5.1 can
> include):
>
> ```bash
> gcloud run deploy readlabs-api --source ./backend --region $REGION \
>   --allow-unauthenticated --port 8080 --memory 512Mi \
>   --service-account $RUNTIME_SA \
>   --set-env-vars "ENVIRONMENT=production,ALLOWED_ORIGINS=https://readlabs.org,SUPABASE_URL=https://<your-ref>.supabase.co" \
>   --update-secrets "SUPABASE_SERVICE_ROLE_KEY=supabase-service-role-key:latest,SUPABASE_ANON_KEY=supabase-anon-key:latest,GEMINI_API_KEY=gemini-api-key:latest,CORE_API_KEY=core-api-key:latest"
> ```

```bash
# Build and push from your laptop (one time)
gcloud auth configure-docker ${REGION}-docker.pkg.dev

IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/readlabs/readlabs-api:bootstrap"
docker build -t $IMAGE ./backend
docker push $IMAGE

# Deploy — secrets get attached via --update-secrets
gcloud run deploy readlabs-api \
    --image $IMAGE \
    --region $REGION \
    --platform managed \
    --allow-unauthenticated \
    --port 8080 \
    --memory 512Mi \
    --service-account $RUNTIME_SA \
    --set-env-vars "ENVIRONMENT=production,ALLOWED_ORIGINS=https://readlabs.org,SUPABASE_URL=https://<your-ref>.supabase.co" \
    --update-secrets "SUPABASE_SERVICE_ROLE_KEY=supabase-service-role-key:latest,SUPABASE_ANON_KEY=supabase-anon-key:latest,GEMINI_API_KEY=gemini-api-key:latest,CORE_API_KEY=core-api-key:latest"
```

Cloud Run prints a temporary service URL (`https://readlabs-api-<hash>-uc.a.run.app`).
That's fine — it's only used until we attach the custom domain in Part 6.

---

## Part 6 — Wire `api.readlabs.org` to Cloud Run

### 6.1 — Create the domain mapping in Cloud Run

```bash
gcloud beta run domain-mappings create \
    --service=readlabs-api \
    --domain=api.readlabs.org \
    --region=$REGION
```

This command prints DNS records (a CNAME or A/AAAA set) that you need to add
to Cloudflare. Copy them.

### 6.2 — Add the DNS records in Cloudflare

1. Cloudflare dashboard → `readlabs.org` → **DNS** → **Records**
2. Add the record(s) from 6.1. For Cloud Run, it's typically:
   - Type: `CNAME`
   - Name: `api`
   - Target: `ghs.googlehosted.com` (or whatever the command printed)
   - Proxy status: **DNS only** (gray cloud, not orange) — Google manages the TLS cert; Cloudflare proxying would conflict.
3. Save.

### 6.3 — Wait for the certificate

```bash
# Watch the mapping until status = "Ready" (usually 5-15 min)
gcloud beta run domain-mappings describe \
    --domain=api.readlabs.org \
    --region=$REGION \
    --format="value(status.conditions[0].type,status.conditions[0].status)"
```

### 6.4 — End-to-end smoke test

```bash
# Should return {"status":"ok"}
curl https://api.readlabs.org/health
```

Then visit https://readlabs.org in a browser, sign up, upload a paper. Watch
Cloud Run logs in real time:

```bash
gcloud run services logs tail readlabs-api --region=$REGION
```

---

## Part 7 — Hook up GitHub Actions auto-deploy

Now that everything works manually, automate it.

In your GitHub repo → Settings → Secrets and variables → Actions:

**Repository secrets:**
- `GCP_WORKLOAD_IDENTITY_PROVIDER` = the long string from the last command in 5.5
  (looks like `projects/123456/locations/global/workloadIdentityPools/github-pool/providers/github-provider`)
- `GCP_DEPLOY_SERVICE_ACCOUNT` = `gh-deployer@<project-id>.iam.gserviceaccount.com`

**Repository variables** (Variables tab, not Secrets — these aren't sensitive):
- `GCP_PROJECT_ID` = your project ID
- `GCP_REGION` = `us-central1` (or whatever you picked)
- `SUPABASE_URL` = your Supabase project URL
- `ALLOWED_ORIGINS` = `https://readlabs.org`

Test it by editing any file under `backend/` and pushing to `main`. The
`Deploy backend to Cloud Run` workflow should run and ship the change in ~3 min.

---

## Ongoing workflow

| Change | What happens |
|---|---|
| Edit frontend, push to `main` | Cloudflare Pages auto-builds + deploys to `readlabs.org` in ~90s |
| Open a PR with frontend changes | Cloudflare publishes a preview at `<sha>.<project>.pages.dev` |
| Edit backend, push to `main` | GitHub Actions builds image + deploys to Cloud Run in ~3 min |
| Add a SQL migration | Run `supabase db push` from your laptop |
| Rotate a secret | Update Secret Manager (`gcloud secrets versions add ...`), then redeploy Cloud Run so it picks up `:latest` |

---

## Troubleshooting

**Cloud Run deploy fails with "Container failed to start"**
→ `gcloud run services logs read readlabs-api --region=$REGION --limit=50` — usually a missing env var or secret.

**Frontend gets CORS errors**
→ `ALLOWED_ORIGINS` env var on Cloud Run must exactly match the frontend origin (`https://readlabs.org`, no trailing slash). Redeploy after changing it.

**"Token expired" loop after login**
→ Check Supabase Auth → URL Configuration includes `https://readlabs.org` in both Site URL and Redirect URLs.

**`api.readlabs.org` returns 404 or hangs**
→ The domain mapping isn't `Ready` yet. Check `gcloud beta run domain-mappings describe ...`. If stuck >30 min, verify the Cloudflare DNS record points at the exact target Google provided and the proxy is **off** (gray cloud).

**Cloudflare shows "Error 525 SSL handshake failed" on `api.readlabs.org`**
→ Cloudflare proxying is on (orange cloud) but Cloud Run manages its own cert. Switch the DNS record to **DNS only**.

**Supabase project paused after 7 days**
→ Free tier pauses inactive projects. Click "Restore" in the Supabase dashboard. To prevent: set up an external uptime ping (e.g. cron-job.org → `https://readlabs.org`) every few days.

---

## Why `api.readlabs.org` and not just `readlabs.org/api`?

Two reasons:

1. **Different platforms.** The frontend is on Cloudflare's CDN and the backend
   is on Google Cloud Run. Routing `/api/*` to a different origin would require
   a Cloudflare Worker in the middle — extra moving part, extra cold-start
   surface, extra place for things to break.
2. **CORS clarity.** With distinct origins, CORS is explicit: backend allows
   `https://readlabs.org`, that's it. No cookie domain confusion, no SSR/edge
   request weirdness.

The browser handles the two origins seamlessly — users don't see `api.readlabs.org`
in their address bar; it's only ever called via `fetch()` from the frontend.
