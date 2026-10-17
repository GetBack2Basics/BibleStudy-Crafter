# Google Cloud Deployment & Architecture Guide

This guide covers deploying **BibleStudy-Crafter** to Google Cloud Platform (GCP) with **User Profiles & RBAC**, **Google OAuth Login**, and the **Bring-Your-Own-Key (BYOK) / Free Tier** system.

---

## 🏛️ GCP Architecture Overview

| Component | GCP Service | Description |
|---|---|---|
| **Frontend Web App** | Cloud Run (or Firebase Hosting) | React + TypeScript SPA containerized with Nginx |
| **Backend API** | Cloud Run | FastAPI serverless container autoscaling 0 to N |
| **Database** | Cloud SQL for PostgreSQL 16 | Relational storage for users, studies, verses, and settings |
| **Media Assets** | Google Cloud Storage (GCS) | Bucket for generated infographics, audio narration (TTS), and video |
| **Secrets & Keys** | Secret Manager | Secure storage for `DATABASE_URL`, `SECRET_KEY`, OAuth credentials |
| **Container Registry** | Artifact Registry | Docker images for Web and API builds |

---

## 🔑 1. Profile Login & RBAC Configuration

The platform adheres to the **User Profiles & Project Assignments Playbook**:

### Role Hierarchy
1. **`SUPER_ADMIN`**: Set via the `SUPER_ADMIN_EMAIL` environment variable. On first Google sign-in or email registration, this email is automatically promoted to `SUPER_ADMIN`.
2. **`ADMIN`**: Granted by Super Admin through the **User Management** panel in the app UI. Can promote/demote members and view system statistics.
3. **`MEMBER`**: Default role for new sign-ups. Can create, edit, and export their personal Bible studies.

### Setting Up Google OAuth (GCP)
1. Go to **[Google Cloud Console > APIs & Services > Credentials](https://console.cloud.google.com/apis/credentials)**.
2. Click **Create Credentials > OAuth Client ID**.
3. Choose **Web application**.
4. Under **Authorized JavaScript origins**, add:
   - `http://localhost:8420` (for local development)
   - `https://your-cloud-run-web-url.a.run.app` (for production)
5. Copy the **Client ID** and set it in your environment:
   ```env
   GOOGLE_CLIENT_ID="1234567890-abcdef.apps.googleusercontent.com"
   SUPER_ADMIN_EMAIL="your-email@gmail.com"
   ```

---

## ⚡ 2. BYOK (Bring Your Own Key) & Free Tier System

Patterned after **LivePersonaCrafter**:

1. **Free Tier Mode (Default)**:
   - Zero keys required from users.
   - Generates study outlines and devotionals using free model pools (e.g. `meta-llama/llama-3.3-70b-instruct:free`, `google/gemma-2-9b-it:free`, or local Ollama).
2. **BYOK Mode (Bring Your Own Key)**:
   - Users can open the **Keys & Settings** drawer in the header to enter their own API keys:
     - **Google Gemini API Key** (Google AI Studio)
     - **OpenRouter API Key**
     - **Anthropic API Key** (Claude)
     - **Fal.ai Key / Replicate Token** (for high-speed media & video generation)
   - Built-in **"Test Connection"** feature verifies keys and reports latency in real-time.

---

## 🚀 3. Automated GCP Deployment

### Prerequisites
1. Install the [Google Cloud SDK (`gcloud`)](https://cloud.google.com/sdk).
2. Authenticate and set your active project:
   ```bash
   gcloud auth login
   gcloud config set project YOUR_GCP_PROJECT_ID
   ```

### Quick Deploy with Script
Run the automated deployment script:
```bash
export GCP_PROJECT_ID="your-project-id"
export GCP_REGION="us-central1"
export SUPER_ADMIN_EMAIL="admin@yourdomain.com"
export GOOGLE_CLIENT_ID="your-google-oauth-client-id.apps.googleusercontent.com"

chmod +x scripts/deploy_gcp.sh
./scripts/deploy_gcp.sh
```

---

## 🗄️ 4. Seeding Bible Translations to Cloud SQL

To populate the offline Bible corpus (KJV, WEB, BBE, etc.) on your Cloud SQL instance:

1. Run the seeder as a Cloud Run Job or from your local machine connected via Cloud SQL Proxy:
   ```bash
   # Connect to Cloud SQL via proxy or directly
   python -m app.seeder.seed_bible
   ```
2. The seeder downloads public domain USFM corpus files, parses books and chapters, and loads ~31,100 verses per translation into PostgreSQL.

---

## 🔒 5. Security & Best Practices

- **Zero-Key Out-of-the-Box**: Never hardcode API keys into container images.
- **Serverless Secrets**: `SECRET_KEY` and database credentials are injected securely via Google Secret Manager.
- **CORS Protection**: The API backend dynamically locks down CORS origins to only allow requests from your production web domain.

---

## 🗺️ 6. Biblical Map Crafter on Google Cloud Storage (GCS)

A dedicated adaptation of [Highlight_Map_Crafter](https://github.com/GetBack2Basics/Highlight_Map_Crafter) is hosted as a serverless static web application on **Google Cloud Storage (GCS)** within the `biblestudy-crafter` GCP project.

### 🌐 Live Map Crafter Studio (GCS)
- **Public Admin & Template Studio**: [`https://storage.googleapis.com/biblestudy-map-crafter/index.html`](https://storage.googleapis.com/biblestudy-map-crafter/index.html)
- **GCS Bucket**: `gs://biblestudy-map-crafter` (Region: `us-central1`, Uniform Bucket-Level Access, configured with web suffix `index.html`).

### 📦 Pre-Loaded Data & Template Capabilities
1. **Ancient Historical Template**:
   - Vintage parchment & shaded physical relief cartography.
   - Ancient provincial boundaries (*Roman Galilee, Samaria, Judea, Decapolis, Peraea*).
   - Biblical highways (*Via Maris, King's Highway*).
   - Historical toponym labels (*Salem, Natzeret, Kfar Nahum*).
2. **Modern Satellite Template**:
   - High-resolution contemporary satellite earth imagery (ESRI World Imagery).
   - Present-day geopolitical borders and modern municipal designations.
3. **Admin Studio Tools**:
   - **➕ Add / Edit Sites**: Insert new archaeological sites, coordinates, elevations, and historical descriptions.
   - **📍 Interactive Pin Relocation**: Drag pins directly on the MapLibre canvas to fine-tune placement.
   - **🏔️ 3D Terrain Relief**: 3D DEM hillshading mesh via AWS Terrarium DEM.
   - **📸 2-JPG Exporter**: Renders and downloads high-resolution **Ancient JPG** and **Current Modern JPG** for any study bounding box.

### 🔄 How BibleStudy-Crafter Consumes the Maps
When a study day is viewed:
1. `geo_service.py` computes the bounding box for the day's mentioned places.
2. It generates direct URLs for the **Ancient Physical Relief JPG** and **Modern Satellite JPG**.
3. `BiblicalMapSection.tsx` displays these 2 real JPG plates in **Side-by-Side** and **Peel Slider** modes.
4. Includes a direct **"Map Crafter Studio (GCS)"** admin deep-link to edit templates and data directly in the browser.

### 🚀 Deploying Map Crafter Updates to GCS
To sync local template or GeoJSON updates in `map_crafter/` to the live GCS bucket:
```powershell
powershell -ExecutionPolicy Bypass -File map_crafter\deploy_to_gcs.ps1
```


