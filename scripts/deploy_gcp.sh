#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# BibleStudy-Crafter Google Cloud Deployment Script
# ==============================================================================

PROJECT_ID="${GCP_PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || true)}"
REGION="${GCP_REGION:-us-central1}"
APP_NAME="biblestudy-crafter"

if [ -z "$PROJECT_ID" ]; then
  echo "Error: GCP_PROJECT_ID is not set. Run 'gcloud config set project <your-project-id>' or export GCP_PROJECT_ID=<your-project-id>"
  exit 1
fi

echo "========================================================"
echo " Deploying ${APP_NAME} to Google Cloud"
echo " Project: ${PROJECT_ID}"
echo " Region:  ${REGION}"
echo "========================================================"

# 1. Enable Required GCP APIs
echo "--> [1/7] Enabling GCP APIs..."
gcloud services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  storage.googleapis.com \
  secretmanager.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  --project="${PROJECT_ID}"

# 2. Create Artifact Registry Repository (if not exists)
REPO_NAME="biblestudy-docker"
echo "--> [2/7] Checking Artifact Registry repository '${REPO_NAME}'..."
if ! gcloud artifacts repositories describe "${REPO_NAME}" --location="${REGION}" --project="${PROJECT_ID}" >/dev/null 2>&1; then
  gcloud artifacts repositories create "${REPO_NAME}" \
    --repository-format=docker \
    --location="${REGION}" \
    --description="Docker repository for BibleStudy-Crafter" \
    --project="${PROJECT_ID}"
fi
AR_PREFIX="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}"

# 3. Create Cloud Storage Bucket for Media Assets
GCS_BUCKET="${PROJECT_ID}-biblestudy-media"
echo "--> [3/7] Setting up Cloud Storage bucket 'gs://${GCS_BUCKET}'..."
if ! gcloud storage buckets describe "gs://${GCS_BUCKET}" --project="${PROJECT_ID}" >/dev/null 2>&1; then
  gcloud storage buckets create "gs://${GCS_BUCKET}" \
    --location="${REGION}" \
    --uniform-bucket-level-access \
    --project="${PROJECT_ID}"
  # Make bucket readable for generated public media if desired
  gcloud storage buckets add-iam-policy-binding "gs://${GCS_BUCKET}" \
    --member="allUsers" \
    --role="roles/storage.objectViewer" || true
fi

# 4. Set up Cloud SQL PostgreSQL Instance
DB_INSTANCE="biblestudy-db"
DB_NAME="bible"
DB_USER="bible"
echo "--> [4/7] Checking Cloud SQL PostgreSQL instance '${DB_INSTANCE}'..."
if ! gcloud sql instances describe "${DB_INSTANCE}" --project="${PROJECT_ID}" >/dev/null 2>&1; then
  echo "Creating Cloud SQL PostgreSQL 16 instance (this may take a few minutes)..."
  DB_PASSWORD=$(openssl rand -hex 16)
  gcloud sql instances create "${DB_INSTANCE}" \
    --database-version=POSTGRES_16 \
    --tier=db-f1-micro \
    --region="${REGION}" \
    --root-password="${DB_PASSWORD}" \
    --project="${PROJECT_ID}"

  gcloud sql databases create "${DB_NAME}" --instance="${DB_INSTANCE}" --project="${PROJECT_ID}"
  gcloud sql users create "${DB_USER}" --instance="${DB_INSTANCE}" --password="${DB_PASSWORD}" --project="${PROJECT_ID}"

  # Store DB URL in Secret Manager
  DB_URL="postgresql+psycopg://${DB_USER}:${DB_PASSWORD}@/${DB_NAME}?host=/cloudsql/${PROJECT_ID}:${REGION}:${DB_INSTANCE}"
  echo -n "${DB_URL}" | gcloud secrets create biblestudy-db-url --data-file=- --project="${PROJECT_ID}" || true
else
  echo "Cloud SQL instance '${DB_INSTANCE}' already exists."
fi

DB_CONN_NAME="${PROJECT_ID}:${REGION}:${DB_INSTANCE}"

# 5. Build and Deploy API Backend
echo "--> [5/7] Building and deploying API backend to Cloud Run..."
gcloud builds submit api \
  --tag="${AR_PREFIX}/api:latest" \
  --file=api/Dockerfile.prod \
  --project="${PROJECT_ID}"

SECRET_KEY_VAL=$(openssl rand -hex 32 2>/dev/null || python -c "import secrets; print(secrets.token_hex(32))")
echo -n "${SECRET_KEY_VAL}" | gcloud secrets create biblestudy-secret-key --data-file=- --project="${PROJECT_ID}" 2>/dev/null || true

gcloud run deploy "${APP_NAME}-api" \
  --image="${AR_PREFIX}/api:latest" \
  --region="${REGION}" \
  --platform=managed \
  --allow-unauthenticated \
  --add-cloudsql-instances="${DB_CONN_NAME}" \
  --set-env-vars="GCS_BUCKET_NAME=${GCS_BUCKET},SUPER_ADMIN_EMAIL=${SUPER_ADMIN_EMAIL:-},GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID:-},CORS_ORIGINS=*" \
  --set-secrets="DATABASE_URL=biblestudy-db-url:latest,SECRET_KEY=biblestudy-secret-key:latest" \
  --memory=1Gi \
  --cpu=1 \
  --project="${PROJECT_ID}"

API_URL=$(gcloud run services describe "${APP_NAME}-api" --region="${REGION}" --format="value(status.url)" --project="${PROJECT_ID}")
echo "API deployed at: ${API_URL}"

# 6. Build and Deploy Web Frontend
echo "--> [6/7] Building and deploying Web frontend to Cloud Run..."
gcloud builds submit web \
  --tag="${AR_PREFIX}/web:latest" \
  --file=web/Dockerfile.prod \
  --build-arg="VITE_API_URL=${API_URL}" \
  --build-arg="VITE_GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID:-}" \
  --project="${PROJECT_ID}"

gcloud run deploy "${APP_NAME}-web" \
  --image="${AR_PREFIX}/web:latest" \
  --region="${REGION}" \
  --platform=managed \
  --allow-unauthenticated \
  --memory=512Mi \
  --cpu=1 \
  --project="${PROJECT_ID}"

WEB_URL=$(gcloud run services describe "${APP_NAME}-web" --region="${REGION}" --format="value(status.url)" --project="${PROJECT_ID}")

# 7. Update API CORS for Web Domain
echo "--> [7/7] Updating API CORS origins for web frontend..."
gcloud run services update "${APP_NAME}-api" \
  --region="${REGION}" \
  --update-env-vars="CORS_ORIGINS=${WEB_URL}" \
  --project="${PROJECT_ID}"

echo "========================================================"
echo " 🎉 Deployment Complete!"
echo " Web Application: ${WEB_URL}"
echo " API Backend:     ${API_URL}"
echo "========================================================"
