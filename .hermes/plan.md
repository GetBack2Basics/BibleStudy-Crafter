# Plan: Topic-anchored verse pool, cumulative context, prayer-with-verses + notes

## Goal
Change study creation from "LLM picks passages per day" to the user-driven flow requested:
1. On create, search the Bible corpus for the topic and present matching verses **in the user's chosen preferred version** for them to pick from.
2. The chosen verses feed day-1 generation (and remain the study's curated pool).
3. Day N uses **all** prior days' entries (cumulative context), not just N-1.
4. Prayers quote the day's chosen verses, and the user can add **notes** to verses and prayer/commentary sections.
5. Preferred Bible version is a **dropdown on the create form** (already stored as `primary_translation`; must be surfaced in UI).

Confirmed decisions: (1) use corpus search (a); (2) every former entry cumulative; preferred version dropdown on create.

## Current state (verified)
- `Study.primary_translation` exists; `StudyCreate.primary_translation` exists (default KJV).
- `GET /api/bible/search?q=&translation=&limit=` full-text search over `verse` exists.
- `DayPassage` has `highlights` (JSON `[{text, note}]`) — unused by UI yet.
- `minutes_per_day` drives word budget (`reading_words = minutes*130`) but LLM emits refs only → length not strictly bounded (note, not in scope to hard-cap, but generation will be told to fill to the budget).
- Day N currently gets only day N-1's ≤120-word summary (`context_summary`).

## Backend changes

### 1. Verse pool search + selection
- `GET /api/bible/search` already supports `translation`. Frontend will call it with the chosen version and topic.
- `StudyCreate`: add `selected_refs: list[str] | None = None` (refs the user picked from search hits).
- `Study` model: add `verse_pool: Optional[list[str]] = Field(default=None, JSON_TYPE)` to persist the chosen pool.
- `_build_outline_and_day1`: if `body.selected_refs` provided, store into `study.verse_pool` and seed day-1's outline `suggested_passages` from it (instead of LLM-only). Outline generation can still run for titles/focus but passages come from the pool.

### 2. Compressed rolling history (day N sees ALL prior days, bounded)
Replace the single N-1 summary with a study-level **compressed history** so day N receives the full prior arc without an unbounded prompt.

- Add `Study.history_json: Optional[dict] = JSON` (shape: `{"arc": str, "recent": [{"day": int, "summary": str}]}`). A fresh model column → needs an idempotent ALTER on the live Postgres (`ALTER TABLE study ADD COLUMN IF NOT EXISTS history_json jsonb`); tests use fresh SQLite so `create_all` covers them. Add `ensure_schema(engine)` in `app/db.py` called from the lifespan after `create_all`, guarded per-dialect (try/except on the ALTER).
- Helpers in `app/services/studies.py`:
  - `build_day_summary(draft) -> str` (= existing `make_summary`, ≤120 words for THAT day).
  - `update_history(history, day_number, day_summary, cap_recent=4, arc_word_cap=400)`:
    - append `{"day", "summary"}` to `recent`;
    - while `len(recent) > cap_recent`: pop oldest → `arc = wordcap(arc + "\nDay X: " + oldest, arc_word_cap)`.
    - This is **deterministic compression** (no extra LLM calls): the `arc` is the ever-compressed "previous history", `recent` keeps the last 4 days verbatim.
  - `get_compressed_history(history) -> str`: `"OVERALL ARC:\n{arc}\n\nRECENT DAYS:\n" + joined recent`.
  - `rebuild_history(study)`: re-derive every prior day's summary from its `blocks_json` and re-compact (used on regenerate / day-edit).
- `generate_day(N)` reads `get_compressed_history(study.history_json)` (empty for day 1) and passes it as `prior_summary`. After a successful draft, `study.history_json = update_history(study.history_json, day_number, build_day_summary(draft))`.
- Keep each `StudyDay.context_summary` as that day's own digest (used by `update_day_endpoint` and the day card); it feeds `rebuild_history`.

Result: day N sees **all** prior days, but bounded (~arc ≤400w + last 4 recent ≤480w ≈ ≤880w regardless of study length). No LLM cost for compaction.

### 3. Prayers quote the day's verses
- `planner.DAY_PROMPT`: add instruction that `opening_prayer` and `closing_prayer` must **open by quoting the key verse(s)** for the day (ref + short phrase), then the prayer. Keep anti-hallucination (quote only refs the app resolved).
- The day's passages (from `DayPassage` / `scripture` blocks) are already passed as `{passages}`; reinforce that prayers reference them.

### 4. User notes on verses + prayer/commentary
- `DayPassage.highlights` becomes the per-verse **note** store: `{text, note}`. Add passages API field `note` (PATCH already supports `highlights`; extend to accept `note` that upserts/updates a highlight entry, or simpler: add `PATCH /passages/{id}` accepts `note` → stored in `highlights=[{text: <verse text>, note}]`). Keep it simple: `note` param sets `highlights=[{"text": <current text>, "note": value}]`.
- Add `DayNote` model (or reuse a JSON column on `StudyDay`): `notes` JSON on `StudyDay` for commentary/prayer free-text notes. Simplest: `StudyDay.notes: Optional[dict] = JSON` with keys `commentary`, `opening_prayer`, `closing_prayer`. Expose via `PUT /api/studies/{id}/days/{n}` (already exists) — extend `DayUpdate` to accept `notes`.
- Frontend: textareas for notes on each passage (verse note) and on prayer/commentary sections; autosaved via existing update endpoints.

## Frontend changes (`web/src`)
- `StudyList` create form: add **Preferred version** dropdown (populated from `/api/bible/translations`). On topic + version chosen, call `/api/bible/search?q=<topic>&translation=<version>&limit=40` and render the hits as checkable list ("all relevant verses"). Selected refs sent in `create({..., primary_translation: version, selected_refs: [...], })`.
- When study opens and is generating, show the chosen pool.
- `PassageEditor`: add a **note** textarea per passage (saves via passages PATCH `note`).
- `DayCard`/`DraftEditor`: add note textareas for commentary + each prayer (save via `PUT /days/{n}` `notes`).
- `studies.ts`: add `selected_refs`, `note` to types; extend `studies.create` body and `passages.update` to accept `note`; `DayUpdate` notes.

## Tests (`api/tests`)
- `test_context_cumulative`: day 3 receives summaries of days 1 AND 2 (assert prior_summary contains both, or assert cumulative builder concatenates).
- `test_verse_pool_used_for_day1`: create with `selected_refs`, assert day-1 passages == chosen refs.
- `test_prayer_quotes_verse`: stub LLM; assert returned `opening_prayer`/`closing_prayer` contain a passage ref (or at least the prompt includes the verse-quoting instruction — assert prompt contains "quote").
- `test_passage_note`: PATCH passage with `note`, assert `highlights` stores it; GET returns it.
- Run `docker compose run --rm --no-deps api pytest` (110→ ~114) and `npx tsc --noEmit`.

## Verification
- 110+ backend tests pass; tsc clean.
- Browser: create study "Peace" with version WEB → search shows WEB verses → pick 2 → study generates with those as day-1 passages; open day 1 → prayers quote a verse; add a verse note + a commentary note → reload → notes persist.
- Confirm day 2 generation context includes day 1 (via test; browser optional).

## Out of scope
- Hard length-cap on verses (budget is advisory). 
- Re-seeding corpus (already loaded, 248k verses).
- Commit/push (only on your approval).
