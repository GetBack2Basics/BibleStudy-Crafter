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
make up          # build + start (stamps the build), then:
make seed        # download + load public-domain Bibles into Postgres
```

Open http://localhost:5173

## Status

Phase 0 — scaffold. See `.hermes/plans/` for the implementation plan.
