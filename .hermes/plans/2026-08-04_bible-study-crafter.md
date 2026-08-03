# BibleStudy-Crafter — Implementation Plan

> **For Hermes:** implement task-by-task with subagent-driven-development. One task = one commit.

**Goal:** A Docker-Compose app on `localhost` where a user picks a *topic*, *minutes/day* and *number of days*, gets an AI-drafted themed study plan they can edit inline (JobCrafter-style highlight-to-rewrite), with AI-suggested passages, side-by-side translation compare, and generated study aids (images, infographics, narrated video).

**Architecture:** 5 containers — `web` (React 19 + Vite + TS + Tailwind + TipTap), `api` (FastAPI, Python 3.11), `db` (Postgres 16), `redis` + `worker` (RQ) for slow asset jobs, plus a one-shot `seeder` that bulk-loads Bible text into Postgres so scripture lookup/compare is **offline and free**. All model providers sit behind one `providers.yaml` registry: free text by default, cheap paid only for assets, everything user-swappable in a Settings UI.

**Tech Stack:** Docker Compose · FastAPI · SQLModel/Alembic · Postgres 16 · RQ · React 19/Vite/Tailwind/TipTap · ffmpeg · edge-tts · OpenRouter/Gemini/Ollama (text) · fal.ai/Replicate (assets)

---

## Decisions locked (2026-08-04)

| # | Decision | Impact |
|---|---|---|
| 1 | **Single-user now, accounts in Phase 7** (post-initial-build, mirroring CoverLetter-Crafter's later Firebase auth commit) | Every owned table gets a **nullable `user_id`** from day one so the auth migration is additive, never a rewrite. Local single user = `user_id NULL`. |
| 2 | **Denominational lens: build now** | `Setting: tradition` — Non-denominational (default) / Reformed / Catholic / Orthodox / Anglican / Baptist / Pentecostal / Methodist. Injected into every planner + rewrite system prompt. |
| 3 | **Imagery policy: build now, restrictive default** | `Setting: imagery_policy` = `symbolic` (default: no faces of Jesus or named biblical persons — landscape, symbolic, typographic) / `figurative_ok` / `text_only`. Enforced in the prompt builder, not just the UI. |
| 4 | **Group/leader mode: deferred** | Not in this plan. Keep `blocks_json` block types open-ended so leader-notes blocks slot in later without migration. |
| 5 | **Rolling summary for continuity** | Each `StudyDay` stores `context_summary` (≤120 words). Day N's prompt receives the day N-1 summary, not the full prior text — keeps free-tier context small while preserving narrative flow. |
| 6 | **Build stamp + running log in UI** | Bottom-right persistent footer widget: build date/version in `yyyymmddhhmm`, refreshed on every rebuild, sitting next to a live-tailing activity log. Spec below. |

---

## Build stamp & running log (bottom-right widget)

**Build stamp.** A single source of truth generated at image build time, not runtime.

- `docker-compose.yml` passes `BUILD_STAMP` as a build arg to both `api` and `web`:
  `args: { BUILD_STAMP: "${BUILD_STAMP:-dev}" }`
- `Makefile` / `make up` computes it: `BUILD_STAMP=$(date +%Y%m%d%H%M) docker compose up -d --build`
  (git-bash: `export BUILD_STAMP=$(date +%Y%m%d%H%M)`)
- Fallback so a bare `docker compose up --build` still stamps correctly: each Dockerfile runs
  `RUN echo "${BUILD_STAMP:-$(date +%Y%m%d%H%M)}" > /app/BUILD_STAMP`
- `web` bakes it in via Vite: `define: { __BUILD_STAMP__: JSON.stringify(process.env.BUILD_STAMP) }`
- `api` exposes `GET /api/meta` → `{build_stamp, git_sha, started_at, version}`

**Widget** — `web/src/components/StatusDock.tsx`, fixed bottom-right, always mounted:

```
┌──────────────────────────────── ▾ ┐
│ ● 202608041530   api ✓  worker ✓  │   ← collapsed: build stamp + health dots
├───────────────────────────────────┤
│ 15:31:02  study#3 outline ✓ free  │   ← expanded: running log, newest last
│ 15:31:44  day 1 draft ✓ 0.0s free │
│ 15:32:10  infographic queued      │
│ 15:32:31  infographic ✓ $0.00     │
│ 15:33:02  image ✗ no FAL_KEY      │
└───────────────────────────────────┘
```

- Collapsed by default to a single pill; click to expand to a scrollable 200-line log.
- Build stamp turns **amber** when the running stamp differs from the one `/api/meta` reports — instant "you're looking at a stale frontend" signal after a rebuild.
- Log source: `GET /api/events` (SSE). Server pushes an `Event{ts, level, scope, message, cost_usd?}` for every LLM call, asset job transition, seed step, and error. Buffer is a 500-entry ring in Redis so it survives page reloads.
- Rows are colour-coded by level and show cost when non-zero; a footer line shows `month-to-date $X.XX / cap $Y.YY`.

<!--APPEND2-->


---

## Verified environment facts (checked 2026-08-04 on this machine)

| Check | Result |
|---|---|
| `docker` / `docker compose` | **INSTALLED 2026-08-04** — Docker 29.6.2, Compose v5.3.1, Desktop 4.85.0, WSL2 backend (`docker-desktop` distro running). `hello-world` verified. Task 0 complete. |
| `node` | v22.23.1 ✅ |
| `python` | 3.11.15 ✅ (`python3` alias missing — use `python`) |
| `ffmpeg` | present at `AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg.../bin` ✅ |
| GPU | no `nvidia-smi` → **no local diffusion**; asset gen must be API-based |
| Shell | git-bash (MSYS). POSIX syntax, `/c/...` paths |

## Verified data sources (live-tested with curl, 2026-08-04)

| Source | Status | Use |
|---|---|---|
| `bible.helloao.org/api/` | 200 ✅ — returns `available_translations.json`, `/api/BSB/books.json` | **Primary bulk seed.** 1000+ translations, JSON, free, CC/PD-cleared set |
| `bolls.life/get-text/KJV/43/3/` | 200 ✅ — returns verse JSON w/ Strong's `<S>1234</S>` tags | Secondary: Strong's numbers + lexicon (BDB/Thayer) for word-study aids. Author asks for bulk download, not per-chapter scraping |
| `bible-api.com/john+3:16?translation=web` | 200 ✅ | Fallback only |

**Licensing rule to encode in the app:** ship/seed only public-domain or explicitly-free translations (KJV, WEB, ASV, YLT, BSB, Darby, etc.). Copyrighted ones (NIV/ESV/NLT/NASB) are **not** bundled — the Settings UI can accept a user's own API.Bible key and fetch those live. Store a `license` + `bundled` flag per translation and show attribution in the UI.

---

## Model routing: free text, cheap assets, all swappable

Single registry file `api/config/providers.yaml`, overridable per-user in the DB via Settings UI. Tiers:

| Job | Default (free) | Paid upgrade | Notes |
|---|---|---|---|
| Study outline, day drafts, rewrites, passage suggestion | OpenRouter `:free` pool with fallback chain | Gemini 3 Flash / Claude Haiku | Free pool is rate-limited (~50 req/day on OpenRouter). Chain must fail over, not crash |
| Fully local text | Ollama `llama3.1:8b` / `gemma3` at `host.docker.internal:11434` | — | For zero-network use |
| Images / infographic panels | none free | **fal.ai FLUX.2 Klein 4B $0.012** or **SDXL-Turbo $0.0002**, Seedream V4 $0.03 | verified pricing table, Aug 2026 |
| Video | none free | **fal.ai Wan 2.5 $0.05/sec** (cheapest verified) or LTX 2.0 | 8-sec clip ≈ $0.40 |
| Narration (TTS) | **edge-tts (free, unlimited, in-container)** | OpenAI TTS / ElevenLabs | edge-tts is the default; no key needed |
| Slideshow video assembly | **ffmpeg (free)** — Ken Burns pan/zoom over generated stills + TTS track | genuine video model | This is the default "video" path; true video gen is opt-in and cost-gated |

**Cost guardrail (must-build, not optional):** every asset job is priced *before* execution from a static price table, shown to the user as "This will cost ≈ $0.14 — proceed?", and counted against a monthly budget cap stored in settings. Jobs are refused when the cap is hit.

---

## Data model (`api/app/models.py`)

```
Translation   id, code(KJV), name, language, license, bundled, source
Verse         id, translation_id, book(1-66), chapter, verse, text  -- unique(translation_id,book,chapter,verse)
Study         id, title, topic, minutes_per_day, total_days, status, created_at, settings_json
StudyDay      id, study_id, day_number, title, est_minutes, blocks_json, ai_draft_json, user_edited(bool)
DayPassage    id, study_day_id, ref_book, ref_chapter, ref_verse_start, ref_verse_end, rationale, primary(bool)
Asset         id, study_day_id, kind(image|infographic|video|audio), provider, model, prompt,
              file_path, cost_usd, status(queued|running|done|failed), error
Setting       key, value_json          -- provider choices, API keys (encrypted), budget cap,
                                       -- tradition, imagery_policy
UsageLedger   id, ts, job_kind, provider, model, cost_usd, study_id
Event         id, ts, level, scope, message, cost_usd, study_id   -- feeds the running log
```

**Auth-forward rule (decision 1):** `Study`, `Asset`, `Setting` and `UsageLedger` each carry a
**nullable `user_id`** from the first migration. Single-user local = `NULL`. Phase 7 adds a `User`
table and backfills — additive migration, no table rewrites.

`StudyDay` also carries `context_summary` (≤120 words, decision 5).

`blocks_json` is the editable document: an ordered list of typed blocks
(`{id, type: heading|paragraph|scripture|question|prayer|aid, content, meta}`).
This is what TipTap renders and what the inline-rewrite endpoint patches — **one block at a time**, never a whole-document regenerate.

---

## Inline editing model (matching CoverLetter-Crafter's "Iterative Paragraph Refinement")

Confirmed from the reference repo: user highlights a snippet → prompts a targeted AI rewrite → sees original vs revised. Replicated as:

1. TipTap editor renders `blocks_json`.
2. User selects text inside a block → floating toolbar appears: **Rewrite · Simplify · Expand · Make pastoral · Add cross-reference · Remove AI voice**.
3. `POST /api/days/{id}/blocks/{block_id}/rewrite` sends **only that block + study context**, returns `{original, revised, note}`.
4. UI shows a diff pill: Accept / Reject / Retry. Accept writes to `blocks_json` and sets `user_edited=true`.
5. `user_edited` blocks are **never** overwritten by any later bulk regenerate — hard rule, needs a test.

---

## Repo layout

```
C:\Projects\BibleStudy-Crafter\
  docker-compose.yml          .env.example       README.md
  api\  Dockerfile  requirements.txt
        app\  main.py models.py db.py schemas.py
              routers\  studies.py days.py bible.py assets.py settings.py
              services\ llm.py bible_service.py planner.py assets.py budget.py
              config\   providers.yaml  prices.yaml
        alembic\
        tests\
  worker\ Dockerfile  worker.py  jobs\ image.py video.py infographic.py tts.py
  seeder\ Dockerfile  seed_bible.py  translations.txt
  web\    Dockerfile  package.json vite.config.ts tailwind.config.js
          src\ App.tsx main.tsx
               pages\ Home.tsx NewStudy.tsx StudyView.tsx DayEditor.tsx Settings.tsx
               components\ BlockEditor.tsx InlineRewriteToolbar.tsx DiffPill.tsx
                           PassagePicker.tsx TranslationCompare.tsx AssetPanel.tsx CostGate.tsx
               lib\ api.ts types.ts
  data\   bibles\ (seed cache)  media\ (generated assets, bind-mounted)
```

---

## Phase 0 — Prerequisites & scaffold

### Task 0: Install Docker Desktop — ✅ DONE 2026-08-04

Installed via `winget install -e --id Docker.DockerDesktop` (v4.85.0). Two gotchas hit and resolved — **record these, they will recur on any fresh Windows box:**

1. Docker Desktop installs fine but the engine fails with *"Docker Desktop is unable to start"* when **WSL is absent**. `wsl.exe --status` reported "not installed" even though `HypervisorPresent=True`.
2. Fix required elevation: `Start-Process wsl.exe -ArgumentList '--install','--no-distribution' -Verb RunAs -Wait` (UAC prompt). No reboot was needed afterwards — WSL 2.7.11.0 / kernel 6.18.33.2 installed live.
3. Restart Docker Desktop after WSL lands; it then provisions the `docker-desktop` distro and the engine comes up (~60-90 s).
4. git-bash does not get Docker on PATH automatically. Appended to `~/.bashrc`:
   `export PATH="$PATH:/c/Program Files/Docker/Docker/resources/bin"`

**Verified:** `docker --version` → 29.6.2 · `docker compose version` → v5.3.1 · `docker run --rm hello-world` → "Hello from Docker!" · `wsl -l -v` → `docker-desktop  Running  2`.

### Task 1: Git init + skeleton
Create the directory tree above with empty `.gitkeep`s, `.gitignore` (`.env`, `node_modules/`, `data/media/`, `data/bibles/`, `__pycache__/`, `*.db`), and `README.md` stub.
**Verify:** `git -C /c/Projects/BibleStudy-Crafter status` → clean tree with untracked skeleton. Commit `chore: scaffold repo`.

### Task 2: docker-compose.yml
Services: `db` (postgres:16-alpine, volume `pgdata`, healthcheck `pg_isready`), `redis` (redis:7-alpine), `api` (build ./api, port 8000, depends_on db healthy, mounts `./data/media:/media`), `worker` (build ./worker, same env, no port), `web` (build ./web, port 5173, `VITE_API_URL=http://localhost:8000`), `seeder` (build ./seeder, `profiles: ["seed"]` so it only runs on demand).
**Verify:** `docker compose config` prints resolved YAML with no errors. Commit.

### Task 3: .env.example + settings loader
Keys: `POSTGRES_*`, `DATABASE_URL`, `REDIS_URL`, `SECRET_KEY`, and **all optional**: `OPENROUTER_API_KEY`, `GEMINI_API_KEY`, `FAL_KEY`, `REPLICATE_API_TOKEN`, `OLLAMA_BASE_URL`, `MONTHLY_BUDGET_USD=5.00`.
**Test first:** `tests/test_settings.py::test_app_boots_with_no_api_keys` — app must import and serve `/health` with an empty `.env`. This is the "free by default" contract.
**Verify:** `docker compose run --rm api pytest tests/test_settings.py -v` → 1 passed. Commit.

### Task 3b: Build stamp plumbing (decision 6)
Add `BUILD_STAMP` build-arg to `api` + `web` in compose; write `/app/BUILD_STAMP` in both Dockerfiles with the `$(date +%Y%m%d%H%M)` fallback; add `Makefile` target `up:` that exports the stamp and runs `docker compose up -d --build`; add Vite `define.__BUILD_STAMP__`.
Implement `GET /api/meta` → `{build_stamp, git_sha, started_at, version}`.
**Test first:** `tests/test_meta.py::test_meta_returns_12_digit_stamp` — asserts `re.fullmatch(r"\d{12}", stamp)`.
**Verify:** `make up` then `curl localhost:8000/api/meta` → stamp matches the minute you built. Rebuild a minute later → stamp changes. Commit.

### Task 3c: Event bus + SSE feed
`services/events.py`: `emit(level, scope, message, cost_usd=None, study_id=None)` writes an `Event` row **and** LPUSHes onto a Redis 500-entry capped list. `GET /api/events` streams SSE from that list (replay buffer on connect, then live). Worker emits through the same Redis list so its jobs appear in the dock.
**Test first:** `tests/test_events.py` — (a) emit then read back returns the entry, (b) ring caps at 500.
**Verify:** `pytest tests/test_events.py -v` → 2 passed; `curl -N localhost:8000/api/events` streams a heartbeat. Commit.

---

## Phase 1 — Bible corpus (offline, free, licence-clean)

### Task 4: Models + Alembic migration
Write `api/app/models.py` with the schema above (SQLModel). Generate migration.
**Verify:** `docker compose run --rm api alembic upgrade head` then `docker compose exec db psql -U bible -c '\dt'` → 8 tables. Commit.

### Task 5: Seeder — download translations
`seeder/translations.txt` = `KJV, WEB, ASV, YLT, BSB, DARBY, WEBBE` (all PD/free — confirm each entry's `licenseUrl` from `available_translations.json` before adding).
`seed_bible.py`: fetch `https://bible.helloao.org/api/available_translations.json`, filter to the allowlist, download each book's chapter JSON to `data/bibles/<CODE>/`, resume-safe (skip files already on disk), 0.2s throttle.
**Test first:** `tests/test_seeder.py::test_parses_helloao_chapter_fixture` against a committed 20-verse fixture — no network in tests.
**Verify:** `pytest tests/test_seeder.py -v` → passes. Then real run `docker compose --profile seed run --rm seeder --only KJV` → `data/bibles/KJV/` populated. Commit.

### Task 6: Seeder — load into Postgres
Bulk `COPY` verses; idempotent via unique constraint + upsert.
**Verify:** `docker compose exec db psql -U bible -c "select code,count(*) from verse join translation t on t.id=translation_id group by code;"` → KJV ≈ 31,102 rows. Commit.

### Task 7: Bible service + reference parser
`bible_service.py`: `parse_ref("John 3:16-18")` → `(43,3,16,18)`; handle `Jn 3:16`, `1 Cor 13`, `Ps 23:1-6`, whole-chapter, and invalid input → `ValueError`.
**Test first:** `tests/test_refs.py` with ~15 cases incl. 3 malformed.
**Verify:** `pytest tests/test_refs.py -v` → 15 passed. Commit.

### Task 8: `/api/bible` endpoints
- `GET /api/bible/translations` → bundled list + licence text
- `GET /api/bible/passage?ref=John+3:16-18&translation=KJV`
- `GET /api/bible/compare?ref=...&translations=KJV,WEB,BSB` → `{ref, verses:[{verse, texts:{KJV:"...",WEB:"..."}}]}` (verse-aligned, the shape the compare UI needs)
- `GET /api/bible/search?q=love&translation=WEB&limit=50` (Postgres full-text)
**Test first:** `tests/test_bible_api.py` — 4 tests, seeded test DB.
**Verify:** `pytest tests/test_bible_api.py -v` → 4 passed; `curl "localhost:8000/api/bible/compare?ref=John+3:16&translations=KJV,WEB"` returns both texts. Commit.

---

## Phase 2 — LLM layer (free-first, swappable)

### Task 9: `providers.yaml` + provider registry
Declare providers with `kind` (openai_compatible | gemini | ollama | fal | replicate), `base_url`, `env_key`, `models[]`, `tier` (free|paid), `cost_per_1k`.
Text chain default: `openrouter:free-pool` → `ollama:local` → error. Each entry carries a human label for the Settings dropdown.
**Verify:** `pytest tests/test_providers.py::test_registry_loads_and_validates` → passes. Commit.

### Task 10: `llm.py` — unified `complete()` with failover
`async complete(prompt, *, system, json_schema=None, tier="free") -> LLMResult{text, model, cost_usd}`.
Rules: try providers in chain order; on 429/402/timeout move to next; log every attempt; if `json_schema` set, validate and retry once with a repair prompt before failing. All calls write a `UsageLedger` row (cost 0 for free tier).
**Test first:** `tests/test_llm.py` — mock httpx: (a) first provider 429 → second succeeds, (b) all fail → `NoProviderAvailable`, (c) malformed JSON → repaired on retry.
**Verify:** `pytest tests/test_llm.py -v` → 3 passed. Commit.

### Task 11: Study planner — outline generation
`planner.generate_outline(topic, minutes_per_day, total_days)` → JSON-schema'd `{title, summary, days:[{day_number,title,focus,est_minutes,suggested_passages:[{ref,rationale}]}]}`.
Prompt must budget content to the minutes: roughly **130 wpm reading + 2 min/reflection question**, so a 15-min day ≈ 900 words + 3 questions. Encode that arithmetic in the prompt and assert it in the test.
**Test first:** `tests/test_planner.py::test_outline_day_count_matches_request` and `::test_est_minutes_within_20pct` using a stubbed LLM returning a canned fixture.
**Verify:** `pytest tests/test_planner.py -v` → 2 passed. Commit.

### Task 11b: Tradition lens + prompt builder (decision 2)
`services/prompts.py::build_system(tradition, imagery_policy)` — single chokepoint every LLM call goes through. Tradition options: Non-denominational (default), Reformed, Catholic, Orthodox, Anglican, Baptist, Pentecostal, Methodist. Each maps to a short interpretive-posture paragraph (e.g. Catholic → may cite deuterocanon + Catechism framing; Reformed → covenantal, confessional; Orthodox → patristic/liturgical). Non-denominational is deliberately ecumenical and avoids contested distinctives.
**Test first:** `tests/test_prompts.py` — (a) each tradition yields a distinct system prompt, (b) unknown tradition falls back to non-denominational rather than raising, (c) the tradition string reaches `generate_outline`'s system message.
**Verify:** `pytest tests/test_prompts.py -v` → 3 passed. Commit.

### Task 12b: Rolling context summary (decision 5)
After a day's draft is generated, a cheap follow-up call produces a ≤120-word `context_summary` stored on `StudyDay`. `generate_day(N)` receives **only** day N-1's summary (plus the outline), never full prior text.
**Test first:** `tests/test_context.py` — (a) summary is generated and ≤120 words, (b) `generate_day(3)`'s prompt contains day 2's summary and does **not** contain day 1's full body text, (c) day 1 works with no prior summary.
**Verify:** `pytest tests/test_context.py -v` → 3 passed. Commit.

### Task 12: Day draft generation → blocks
`planner.generate_day(study, day)` → `blocks_json`: heading, opening prayer, scripture blocks (text pulled **from local DB**, never hallucinated by the LLM — the model only supplies the *reference*, the service resolves the text), 2-4 paragraphs of commentary, 3 reflection questions, closing prayer, and `aid` placeholders.
**Test first:** `test_scripture_block_text_comes_from_db` — stub the LLM to return a wrong verse text and assert the stored block still contains the DB text. This is the anti-hallucination guarantee and is non-negotiable.
**Verify:** `pytest tests/test_planner.py -v` → 3 passed. Commit.

### Task 13: `POST /api/studies` + background generation
Create study → enqueue outline job → return `202 {study_id, status:"generating"}`. `GET /api/studies/{id}` polls status. Days generate lazily (day 1 eagerly, rest on demand) to stay inside free-tier rate limits.
**Verify:** `curl -X POST localhost:8000/api/studies -d '{"topic":"Forgiveness","minutes_per_day":15,"total_days":7}'` → 202, then poll → `ready` with 7 day stubs and day 1 populated. Commit.

---

## Phase 3 — Inline editing

### Task 14: Block CRUD endpoints
`GET /api/days/{id}`, `PUT /api/days/{id}/blocks` (full reorder/save), `PATCH /api/days/{id}/blocks/{block_id}` (single-block content save, sets `user_edited=true`).
**Test first:** `test_patch_block_sets_user_edited` and `test_regenerate_skips_user_edited_blocks`.
**Verify:** `pytest tests/test_blocks.py -v` → 2 passed. Commit.

### Task 15: Inline rewrite endpoint
`POST /api/days/{id}/blocks/{block_id}/rewrite` body `{selection, instruction, tone?}` → `{original, revised, note}`. Does **not** persist — the UI accepts explicitly.
Preset instructions mirror the reference app, incl. "Remove AI voice".
**Verify:** `pytest tests/test_rewrite.py -v` → 2 passed (returns revised text; does not mutate DB). Commit.

### Task 16: Passage swap + rationale
`POST /api/days/{id}/passages/suggest` → 5 alternates with rationale for the day's theme. `PUT /api/days/{id}/passages/{pid}` swaps and re-resolves the scripture block text from the DB.
**Verify:** `pytest tests/test_passages.py -v` → 2 passed. Commit.

---

## Phase 4 — Frontend

### Task 17: Vite + React 19 + Tailwind + router shell
Match the reference stack (React 19 / Vite / TS / Tailwind / motion). Routes: `/`, `/new`, `/study/:id`, `/study/:id/day/:n`, `/settings`.
**Verify:** `docker compose up web` → `http://localhost:5173` renders nav shell, no console errors. Commit.

### Task 17b: StatusDock widget (decision 6)
`web/src/components/StatusDock.tsx`, mounted in `App.tsx` so it persists across routes. Fixed bottom-right. Collapsed pill = `● {build_stamp}` + api/worker health dots; expanded = scrollable 200-row log fed by the `/api/events` SSE stream, colour-coded by level, cost shown when non-zero, MTD-spend footer. Amber build stamp when `__BUILD_STAMP__ !== meta.build_stamp` (stale frontend after rebuild). Auto-reconnect with backoff on SSE drop.
**Verify:** `make up`, open any page → dock shows the current `yyyymmddhhmm`. Create a study → log rows stream in live. Rebuild in another terminal → stamp goes amber until reload. Commit.

### Task 18: New Study wizard
Three inputs — topic (text), minutes/day (slider 5-60), total days (slider 3-90) — plus a live estimate line: *"7 days × 15 min ≈ 6,300 words of study material · text generation free · assets extra"*. Submits to `POST /api/studies`, then a progress view.
**Verify:** manual — fill "Forgiveness / 15 / 7", see progress then redirect to study view. Commit.

### Task 19: BlockEditor (TipTap)
Render `blocks_json`; scripture blocks are read-only-styled with a translation chip; paragraphs freely editable; debounce-autosave via `PATCH`.
**Verify:** edit a paragraph, reload page, text persists. Commit.

### Task 20: InlineRewriteToolbar + DiffPill
Selection triggers floating toolbar → calls rewrite endpoint → DiffPill shows original strikethrough vs revised, Accept/Reject/Retry.
**Verify:** manual — select a sentence, "Make pastoral", accept, text updates and persists. Commit.

### Task 21: TranslationCompare
Click a scripture block → side panel, verse-aligned columns for up to 4 translations, checkbox picker, "set as primary" button, licence footer.
**Verify:** compare John 3:16 across KJV/WEB/BSB, set BSB primary, block updates. Commit.

---

## Phase 5 — Study aids (cost-gated)

### Task 22: Price table + budget service
`prices.yaml` from the verified figures (SDXL-Turbo 0.0002, FLUX.2 Klein 4B 0.012, Seedream V4 0.03, Wan 2.5 0.05/s, edge-tts 0, ffmpeg 0). `budget.estimate(job)` and `budget.assert_within_cap()`.
**Test first:** `test_refuses_job_over_monthly_cap`.
**Verify:** `pytest tests/test_budget.py -v` → 2 passed. Commit.

### Task 23: Worker + RQ wiring
`POST /api/assets` enqueues; `GET /api/assets/{id}` polls; files land in `/media/{study_id}/`.
**Verify:** enqueue a no-op job, poll to `done`. Commit.

### Task 24: Image job (fal.ai) + imagery policy (decision 3)
`imagery_policy` is enforced in `services/prompts.py::build_image_prompt`, not in the UI:
- `symbolic` (**default**) — landscape, light, objects, typography, abstract composition. Hard negative: no faces of Jesus, no named biblical persons, no anthropomorphic depictions of God.
- `figurative_ok` — human figures permitted; still no depiction of God the Father.
- `text_only` — image jobs disabled entirely; only typographic infographics.
**Test first:** `tests/test_imagery.py` — (a) `symbolic` injects the negative clause, (b) `figurative_ok` omits it, (c) `text_only` makes the image endpoint return 409 with a clear message.
**Verify:** `pytest tests/test_imagery.py -v` → 3 passed. With `FAL_KEY` set, generate one image → file on disk, `cost_usd` logged, event row emitted. Without a key → clean 400 "no image provider configured". Commit.

### Task 25: Infographic job (HTML→PNG, free)
Generate an HTML/Tailwind infographic (timeline, word-study, character map) with the **free text model**, render via Playwright headless in the worker → PNG. Zero marginal cost.
**Verify:** produce a Beatitudes timeline PNG; assert file >20KB. Commit.

### Task 26: TTS narration (edge-tts, free)
Narrate a day's text → MP3, chunked at ~3000 chars, concatenated with ffmpeg.
**Verify:** `ffprobe` reports duration within 20% of the day's estimated read time. Commit.

### Task 27: Slideshow video (ffmpeg, free)
Combine day images + narration into an MP4 with Ken Burns pan/zoom and verse captions burned in.
**Verify:** `ffprobe` shows h264 720p, duration == audio duration ±1s. Commit.

### Task 28: True video job (opt-in, paid)
fal.ai Wan 2.5 behind the CostGate modal; hard-capped at 8 s/clip by default.
**Verify:** cost preview shows ≈$0.40 before running; refuses when over cap. Commit.

### Task 29: AssetPanel + CostGate UI
Per-day panel listing aids with status chips; "Generate" opens CostGate showing provider, model, estimate, remaining budget.
**Verify:** manual — generate infographic (shows $0.00), image (shows $0.012). Commit.

---

## Phase 6 — Settings, export, polish

### Task 30: Settings page
Per-job-kind provider/model dropdowns from the registry, API-key fields (write-only, masked), monthly cap, "prefer free models" toggle, **tradition selector (decision 2)**, **imagery policy radio (decision 3)**. Keys encrypted at rest with `SECRET_KEY`.
**Verify:** switch text provider to Ollama, generate a day, ledger shows the ollama model. Switch tradition to Reformed, regenerate a day, output reflects the lens. Commit.

### Task 31: Export
Whole study → Markdown bundle, PDF (WeasyPrint), and a ZIP with `/media`.
**Verify:** export the 7-day study → PDF has 7 day sections + images. Commit.

### Task 32: README + one-command bootstrap
`make up` / `docker compose up -d && docker compose --profile seed run --rm seeder`. Document the "works with zero API keys" path first, paid tiers second.
**Verify:** on a clean clone, `docker compose up` + seed + create a study end-to-end with an empty `.env`. Commit.

---

## Tests / validation summary

| Layer | Command |
|---|---|
| Python unit/integration | `docker compose run --rm api pytest -v` |
| Ref parser | `pytest tests/test_refs.py -v` (15 cases) |
| Anti-hallucination | `pytest tests/test_planner.py::test_scripture_block_text_comes_from_db` |
| Free-tier contract | `pytest tests/test_settings.py::test_app_boots_with_no_api_keys` |
| Budget | `pytest tests/test_budget.py -v` |
| Frontend | `npm run build` (typecheck) + manual smoke on the 5 routes |
| E2E | create → edit → compare → generate infographic → export |

---

## Risks & open questions

**Risks**
1. **Docker missing** — Task 0 is a hard blocker requiring your action.
2. **Free LLM pools are volatile.** Model IDs on OpenRouter's `:free` tier rotate and are rate-limited (~50 req/day). Mitigation: the chain is config-driven, plus Ollama as an always-available local fallback. Expect to edit `providers.yaml` occasionally.
3. **Theological quality.** A free 30B model will produce shallow or occasionally wrong commentary. Mitigation: scripture text always comes from the DB; commentary is clearly labelled AI-drafted; you can promote to a paid model per-job in Settings.
4. **Translation licensing.** Only PD/free translations are bundled. NIV/ESV etc. require the user's own API.Bible key — the app must never redistribute them.
5. **helloao.org availability.** Single upstream for seeding. Mitigation: seed once, cache to `data/bibles/`, keep bolls.life as an alternate importer.
6. **No GPU** — local diffusion is off the table; images cost money or don't happen. The free aid path is infographic (HTML→PNG) + TTS + ffmpeg slideshow, which is genuinely capable.

**Open questions — all resolved 2026-08-04.** See the Decisions table at the top.
Deferred to a later plan: group/leader mode (decision 4) and accounts (Phase 7, below).

---

## Phase 7 — Accounts (deferred, post-initial-build)

Not part of the initial build. Recorded so Phase 1-6 doesn't paint us into a corner.

- **Task A1** — `User` table (email, password_hash or OAuth sub, created_at); backfill existing `NULL` rows to a "local" user.
- **Task A2** — session auth (HTTP-only cookie + CSRF) or Firebase, matching whatever the reference project settles on.
- **Task A3** — scope every `Study`/`Asset`/`Setting`/`UsageLedger` query by `user_id`; add a test that user B cannot read user A's study.
- **Task A4** — per-user budget caps and API keys, replacing the single global set.
- **Task A5** — optional share links (read-only study view by token).

Because `user_id` is present-but-nullable from Task 4, all of this is additive.

---

## Task count

**37 tasks**: Phase 0 (0-3c: 6) · Phase 1 (4-8: 5) · Phase 2 (9-13 + 11b, 12b: 7) · Phase 3 (14-16: 3) · Phase 4 (17-21 + 17b: 6) · Phase 5 (22-29: 8) · Phase 6 (30-32: 3). Phase 7 (A1-A5) deferred.




