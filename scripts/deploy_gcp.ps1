<#
.SYNOPSIS
    Deploys BibleStudy-Crafter to Google Cloud Platform (Cloud Run, Cloud SQL, Cloud Storage, Secret Manager).
#>

[CmdletBinding()]
param (
    [string]$ProjectId = "biblestudy-crafter",
    [string]$Region = "us-central1",
    [string]$AppName = "biblestudy-crafter",
    [string]$SuperAdminEmail = "coreagc@gmail.com",
    [string]$GoogleClientId = ""
)

$ErrorActionPreference = "Stop"

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host " Deploying $AppName to Google Cloud" -ForegroundColor Cyan
Write-Host " Project: $ProjectId" -ForegroundColor Cyan
Write-Host " Region:  $Region" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan

# 1. Enable APIs
Write-Host "--> [1/7] Enabling GCP APIs..." -ForegroundColor Yellow
gcloud.cmd services enable `
  run.googleapis.com `
  sqladmin.googleapis.com `
  storage.googleapis.com `
  secretmanager.googleapis.com `
  artifactregistry.googleapis.com `
  cloudbuild.googleapis.com `
  cloudresourcemanager.googleapis.com `
  --project=$ProjectId

# 2. Artifact Registry
$RepoName = "biblestudy-docker"
$ArPrefix = "$Region-docker.pkg.dev/$ProjectId/$RepoName"
Write-Host "--> [2/7] Checking Artifact Registry repository '$RepoName'..." -ForegroundColor Yellow
$repoExists = gcloud.cmd artifacts repositories describe $RepoName --location=$Region --project=$ProjectId 2>$null
if (-not $repoExists) {
    gcloud.cmd artifacts repositories create $RepoName `
      --repository-format=docker `
      --location=$Region `
      --description="Docker repository for BibleStudy-Crafter" `
      --project=$ProjectId
}

# 3. Cloud Storage Bucket
$GcsBucket = "$ProjectId-media"
Write-Host "--> [3/7] Setting up Cloud Storage bucket 'gs://$GcsBucket'..." -ForegroundColor Yellow
$bucketExists = gcloud.cmd storage buckets describe "gs://$GcsBucket" --project=$ProjectId 2>$null
if (-not $bucketExists) {
    gcloud.cmd storage buckets create "gs://$GcsBucket" `
      --location=$Region `
      --uniform-bucket-level-access `
      --project=$ProjectId

    gcloud.cmd storage buckets add-iam-policy-binding "gs://$GcsBucket" `
      --member="allUsers" `
      --role="roles/storage.objectViewer" `
      --project=$ProjectId
}

# 4. Build and Deploy API Backend
Write-Host "--> [4/7] Building and deploying API backend to Cloud Run..." -ForegroundColor Yellow
gcloud.cmd builds submit api `
  --config=api/cloudbuild.yaml `
  --substitutions="_IMAGE=$ArPrefix/api:latest" `
  --project=$ProjectId

gcloud.cmd run deploy "$AppName-api" `
  --image="$ArPrefix/api:latest" `
  --region=$Region `
  --platform=managed `
  --allow-unauthenticated `
  --add-cloudsql-instances="$ProjectId:$Region:biblestudy-db" `
  --set-env-vars="GCS_BUCKET_NAME=$GcsBucket,SUPER_ADMIN_EMAIL=$SuperAdminEmail,BOOTSTRAP_ADMIN_EMAIL=$SuperAdminEmail,CORS_ORIGINS=*" `
  --set-secrets="DATABASE_URL=biblestudy-db-url:latest,SECRET_KEY=biblestudy-secret-key:latest" `
  --memory=1Gi `
  --cpu=1 `
  --project=$ProjectId

$ApiUrl = (gcloud.cmd run services describe "$AppName-api" --region=$Region --format="value(status.url)" --project=$ProjectId).Trim()
Write-Host "API deployed at: $ApiUrl" -ForegroundColor Green

# 5. Build and Deploy Web Frontend
Write-Host "--> [5/7] Building and deploying Web frontend to Cloud Run..." -ForegroundColor Yellow
gcloud.cmd builds submit web `
  --config=web/cloudbuild.yaml `
  "--substitutions=_IMAGE=$ArPrefix/web:latest,_VITE_API_URL=$ApiUrl,_VITE_GOOGLE_CLIENT_ID=$GoogleClientId" `
  --project=$ProjectId

gcloud.cmd run deploy "$AppName-web" `
  --image="$ArPrefix/web:latest" `
  --region=$Region `
  --platform=managed `
  --allow-unauthenticated `
  --memory=512Mi `
  --cpu=1 `
  --project=$ProjectId

$WebUrl = (gcloud.cmd run services describe "$AppName-web" --region=$Region --format="value(status.url)" --project=$ProjectId).Trim()

# 6. Update API CORS for Web Domain
Write-Host "--> [6/7] Updating API CORS origins for web frontend..." -ForegroundColor Yellow
gcloud.cmd run services update "$AppName-api" `
  --region=$Region `
  "--update-env-vars=^@^CORS_ORIGINS=$WebUrl,http://localhost:8420" `
  --project=$ProjectId

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host " Deployment Complete!" -ForegroundColor Green
Write-Host " Web Application: $WebUrl" -ForegroundColor Green
Write-Host " API Backend:     $ApiUrl" -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Cyan
