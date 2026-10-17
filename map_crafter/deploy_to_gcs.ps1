# ==============================================================================
# deploy_to_gcs.ps1
# Automated Google Cloud Storage Static Deployment for Biblical Map Crafter
# Project: biblestudy-crafter
# Bucket:  gs://biblestudy-map-crafter
# ==============================================================================

param (
    [string]$ProjectId = "biblestudy-crafter",
    [string]$BucketName = "biblestudy-map-crafter",
    [string]$Region = "us-central1"
)

$ErrorActionPreference = "Continue"

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " Deploying Biblical Map Crafter to Google Cloud Storage" -ForegroundColor Cyan
Write-Host "   Project: $ProjectId" -ForegroundColor Yellow
Write-Host "   Bucket:  gs://$BucketName" -ForegroundColor Yellow
Write-Host "   Region:  $Region" -ForegroundColor Yellow
Write-Host "============================================================" -ForegroundColor Cyan

# 1. Check or Create Bucket
$exists = & gcloud storage buckets describe "gs://$BucketName" --project=$ProjectId 2>$null
if (-not $exists) {
    Write-Host "[INFO] Creating Cloud Storage bucket gs://$BucketName in $Region..." -ForegroundColor Yellow
    & gcloud storage buckets create "gs://$BucketName" --project=$ProjectId --location=$Region --default-storage-class=STANDARD --uniform-bucket-level-access
}

# 2. Configure Website Index
Write-Host "[INFO] Configuring bucket for static web hosting (index.html)..." -ForegroundColor Yellow
& gcloud storage buckets update "gs://$BucketName" --project=$ProjectId --web-main-page-suffix=index.html --web-error-page=index.html

# 3. Grant Public Read Access
Write-Host "[INFO] Granting public read access (roles/storage.objectViewer to allUsers)..." -ForegroundColor Yellow
& gcloud storage buckets add-iam-policy-binding "gs://$BucketName" --project=$ProjectId --member=allUsers --role=roles/storage.objectViewer

# 4. Sync Files to GCS
$LocalDir = $PSScriptRoot
Write-Host "[INFO] Uploading static assets from $LocalDir..." -ForegroundColor Yellow
& gcloud storage rsync "$LocalDir" "gs://$BucketName" --recursive --exclude="\.git.*|.*\.ps1|.*\.sh"

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " Deployment Complete!" -ForegroundColor Green
Write-Host " Public URL: https://storage.googleapis.com/$BucketName/index.html" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan
