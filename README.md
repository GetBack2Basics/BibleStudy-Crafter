# BibleStudy-Crafter

Local-first, Docker-based themed Bible study generator.

Pick a **topic**, **minutes per day** and **number of days** — get an AI-drafted study you can
edit inline, with scripture served from a local offline Bible database, side-by-side translation
comparison, and generated study aids (infographics, narration, imagery, video).

**Runs with zero API keys.** Text generation defaults to free model pools with a local Ollama
fallback; infographics, narration and slideshow video are free. Paid image/video providers are
opt-in and cost-gated.

## Quick start

```bash
cp .env.example .env
make up          # checks ports are free, builds, starts everything
```

Then open **http://localhost:8420**.

### Ports

All host ports live in `.env` and are checked before every `make up`:

| Service | Default | Env var |
|---|---|---|
| web | 8420 | `WEB_PORT` |
| api | 8421 | `API_PORT` |
| postgres | 8422 | `DB_PORT` |
| redis | 8423 | `REDIS_PORT` |

`make up` runs `scripts/check_ports.py` first and **refuses to start** if any
port is taken, printing the owning process and a free block to use instead.
Change the value in `.env` — nothing else needs editing (the API's CORS
allow-list is derived from `WEB_PORT`).

## Status

Phase 0 — scaffold. See `.hermes/plans/` for the implementation plan.
