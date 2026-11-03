# BibleStudy-Crafter – Agent Workflow

## Deploy / push workflow
- After making code changes, finish the job end to end: verify, deploy, and push. Don't stop at "edited the files" unless the user says otherwise.
- **Map Crafter (static site)**: deploy with
  `powershell -ExecutionPolicy Bypass -File c:\Projects\BibleStudy-Crafter\map_crafter\deploy_to_gcs.ps1`
  (bucket `gs://biblestudy-map-crafter`, project `biblestudy-crafter`).
- **Web app + API**: deploy with `scripts/deploy_gcp.sh` (see `docs/google_cloud_deployment_guide.md`).
- **GitHub**: commit and push changes with `git`.

## Environment gotchas (Windows)
- The default sandbox shell has NO `gcloud`, `git`, `node`/`npx` or `python` on PATH, and no network. Commands that need them (deploys, git push, npm builds) must be run with `BypassSandbox: true` (needs user approval). Don't conclude the tools are missing/uninstalled after a sandbox failure; retry unsandboxed.
- `deploy_to_gcs.ps1` prints "Deployment Complete!" even when every `gcloud` call failed. Check the log for real upload output.
- Source files use CRLF line endings; multi-line `edit_file` targets can fail to match. Use single-line targets or a PowerShell replace that preserves `\r\n`.

## Architecture notes
- Auth: tokens in `localStorage` key `bsc_tokens`; `App.tsx` validates them via `auth.me()` (refresh once, else clear and show login).
- Map links: backend builds `map_crafter_url` in `api/app/services/geo_service.py`; Map Crafter (`map_crafter/app.js`) reads `period`, `book`, `density`, `lat`, `lng`, `zoom` from the URL. Map panes in `BiblicalMapSection.tsx` link to it (except the slider view).

