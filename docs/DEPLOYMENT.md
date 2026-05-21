# Deployment Guide

Step-by-step instructions to deploy ReadLabs for free using:

- **Frontend** → Cloudflare Pages
- **Backend** → Google Cloud Run
- **DB / Auth / Storage** → Supabase
- **AI** → Google Gemini

Total cost at low traffic: **$0/month**. Requires a credit card on file at GCP
(no charges within free tier).

---

## Prerequisites

Create accounts (free) if you don't have them:

1. [GitHub](https://github.com/signup)
2. [Supabase](https://supabase.com/dashboard/sign-up)
3. [Cloudflare](https://dash.cloudflare.com/sign-up)
4. [Google Cloud](https://console.cloud.google.com/) — credit card required at signup (no charges at free tier traffic)
5. [Google AI Studio](https://aistudio.google.com/) — for the Gemini API key

Install locally:

- [Google Cloud SDK (`gcloud`)](https://cloud.google.com/sdk/docs/install)
- [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started)
- [GitHub CLI (`gh`)](https://cli.github.com/) — optional but easier

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
- `anon / public` key — for `VITE_SUPABASE_ANON_KEY` and `SUPABASE_ANON_KEY`
- `service_role / secret` key — for `SUPABASE_SERVICE_ROLE_KEY` ⚠️ never expose this to the browser

**Configure auth redirect URLs:**

Authentication → URL Configuration:
- Site URL: `https://<your-app>.pages.dev` (you'll know this after Part 4)
- Redirect URLs: add `https://<your-app>.pages.dev/**`

---

## Part 3 — Get a Gemini API key

1. Visit https://aistudio.google.com/app/apikey
2. **Create API key** → choose your GCP project (or create a new one)
3. Copy the key — you'll paste it into Secret Manager in Part 5

The Gemini free tier gives you 15 RPM and 1M tokens/day on Gemini 2.5 Flash —
plenty for a demo.

---

## Part 4 — Deploy the frontend to Cloudflare Pages

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
   - `VITE_API_URL` = `https://placeholder.run.app` (you'll update this in Part 6 once Cloud Run is live)
5. **Save and Deploy**

After ~2 minutes you'll get a URL like `readlabs-abc.pages.dev`.
**Write this down** — you'll need it for backend CORS in Part 6.

Go back to Supabase → Authentication → URL Configuration and update Site URL +
Redirect URLs with this real Pages URL.

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

### 5.6 — First manual deploy (to get the Cloud Run URL)

Before GitHub Actions can deploy, the Cloud Run service has to exist. Easiest:
one manual deploy with a placeholder image.

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
    --set-env-vars "ENVIRONMENT=production,ALLOWED_ORIGINS=https://<your-app>.pages.dev,SUPABASE_URL=https://<ref>.supabase.co" \
    --update-secrets "SUPABASE_SERVICE_ROLE_KEY=supabase-service-role-key:latest,SUPABASE_ANON_KEY=supabase-anon-key:latest,GEMINI_API_KEY=gemini-api-key:latest,CORE_API_KEY=core-api-key:latest"
```

Cloud Run prints the service URL — looks like `https://readlabs-api-<hash>-uc.a.run.app`. **Write it down.**

---

## Part 6 — Wire frontend to backend

1. Cloudflare Pages → your project → Settings → Environment variables
2. Update `VITE_API_URL` to the Cloud Run URL from 5.6
3. Settings → Deployments → **Retry deployment** (or just push any frontend change)

Test it: open `https://<your-app>.pages.dev`, sign up, upload a paper. Watch
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
- `ALLOWED_ORIGINS` = `https://<your-app>.pages.dev`

Test it by editing any file under `backend/` and pushing to `main`. The
`Deploy backend to Cloud Run` workflow should run and ship the change.

---

## Ongoing workflow

| Change | What happens |
|---|---|
| Edit frontend, push to `main` | Cloudflare Pages auto-builds + deploys in ~90s |
| Open a PR with frontend changes | Cloudflare publishes a preview at `<sha>.<project>.pages.dev` |
| Edit backend, push to `main` | GitHub Actions builds image + deploys to Cloud Run in ~3 min |
| Add a SQL migration | Run `supabase db push` from your laptop |
| Rotate a secret | Update Secret Manager (`gcloud secrets versions add ...`), then redeploy Cloud Run so it picks up `:latest` |

---

## Troubleshooting

**Cloud Run deploy fails with "Container failed to start"**
→ `gcloud run services logs read readlabs-api --region=$REGION --limit=50` — usually a missing env var or secret.

**Frontend gets CORS errors**
→ `ALLOWED_ORIGINS` env var on Cloud Run must exactly match the Pages origin (including https://, no trailing slash). Redeploy after changing it.

**"Token expired" loop after login**
→ Check Supabase Auth → URL Configuration includes the Pages URL in both Site URL and Redirect URLs.

**Supabase project paused after 7 days**
→ Free tier pauses inactive projects. Click "Restore" in the Supabase dashboard. To prevent: set up an external uptime ping (cron-job.org → `https://<your-app>.pages.dev`) every few days.

---

## Adding a custom domain later

When you're ready:

1. Buy a domain (Cloudflare Registrar sells at cost).
2. **Frontend**: Cloudflare Pages → Custom domains → Add `readlabs.com`. DNS auto-configures if the domain is on Cloudflare.
3. **Backend**: Cloud Run → your service → Custom Domains → Add `api.readlabs.com`. Cloud Run gives you a CNAME target; add it in Cloudflare DNS.
4. Update env vars:
   - Cloudflare Pages: `VITE_API_URL=https://api.readlabs.com`
   - Cloud Run: `ALLOWED_ORIGINS=https://readlabs.com`
5. Update Supabase Auth Site URL + Redirect URLs to the new domain.
6. Redeploy both. ~5 minutes of work.
