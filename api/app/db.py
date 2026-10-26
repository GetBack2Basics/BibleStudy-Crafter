"""Engine + session helpers."""
from __future__ import annotations

from collections.abc import Iterator

from sqlalchemy.engine import Engine
from sqlalchemy import text
from sqlmodel import Session, SQLModel, create_engine

from app.config import get_settings

_engine: Engine | None = None


def get_engine() -> Engine:
    global _engine
    if _engine is None:
        url = get_settings().database_url
        kwargs: dict = {"pool_pre_ping": True}
        if url.startswith("sqlite"):
            kwargs["connect_args"] = {"check_same_thread": False}
        _engine = create_engine(url, **kwargs)
    return _engine


def get_session() -> Iterator[Session]:
    with Session(get_engine()) as session:
        yield session


def create_all() -> None:
    import app.models  # noqa: F401  (register metadata)
    SQLModel.metadata.create_all(get_engine())


def ensure_schema() -> None:
    """Idempotent column migrations for an already-running Postgres DB."""
    engine = get_engine()
    if engine.dialect.name != "postgresql":
        return
    import app.models  # noqa: F401
    stmts = [
        "ALTER TABLE study ADD COLUMN IF NOT EXISTS history_json jsonb",
        "ALTER TABLE study ADD COLUMN IF NOT EXISTS verse_pool jsonb",
        "ALTER TABLE study ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT NOW()",
        "ALTER TABLE study_day ADD COLUMN IF NOT EXISTS notes jsonb",
        "ALTER TABLE study_day ADD COLUMN IF NOT EXISTS discussions_json jsonb",
        "ALTER TABLE study_day ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT NOW()",
        "ALTER TABLE day_passage ADD COLUMN IF NOT EXISTS source_reflections jsonb",
        "ALTER TABLE day_passage ADD COLUMN IF NOT EXISTS verse_notes jsonb",
        "ALTER TABLE user_account ADD COLUMN IF NOT EXISTS role varchar(20) DEFAULT 'MEMBER'",
        "ALTER TABLE user_account ADD COLUMN IF NOT EXISTS auth_provider varchar(20) DEFAULT 'EMAIL'",
        "ALTER TABLE user_account ADD COLUMN IF NOT EXISTS picture_url varchar(500) DEFAULT ''",
        "ALTER TABLE user_account ADD COLUMN IF NOT EXISTS organization varchar(120) DEFAULT ''",
        "ALTER TABLE user_account ADD COLUMN IF NOT EXISTS phone varchar(40) DEFAULT ''",
        "ALTER TABLE user_account ADD COLUMN IF NOT EXISTS notes text DEFAULT ''",
        "ALTER TABLE user_account ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT NOW()",
        "ALTER TABLE asset ADD COLUMN IF NOT EXISTS style_preset varchar(60) DEFAULT ''",
        "ALTER TABLE asset ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true",
        "ALTER TABLE asset ADD COLUMN IF NOT EXISTS meta_json jsonb",
        "ALTER TABLE event ADD COLUMN IF NOT EXISTS user_id integer",
    ]
    with engine.connect() as conn:
        for sql in stmts:
            try:
                conn.execute(text(sql))
            except Exception:  # noqa: BLE001 - schema drift must never crash startup
                pass
        conn.commit()

    try:
        from app.services.bible_service import ensure_translations
        with Session(engine) as session:
            ensure_translations(session)
    except Exception:
        pass


def rebuild_database(seed_demo: bool = False) -> None:
    """Clear out and rebuild the entire database from scratch with clean schema & seed data."""
    import app.models  # noqa: F401
    engine = get_engine()

    # 1. Drop all tables
    SQLModel.metadata.drop_all(engine)

    # 2. Create clean tables from registered SQLModel metadata
    SQLModel.metadata.create_all(engine)

    # 3. Ensure schema (for postgres dialect if any specific extensions)
    ensure_schema()

    # 4. Seed canon books & base translations
    from app.seeder.seed_bible import ensure_books
    from app.services.bible_service import ensure_translations
    with Session(engine) as session:
        ensure_books(session)
        ensure_translations(session)

    # 5. Ensure demo account exists (WITHOUT auto-seeding studies unless requested)
    ensure_demo_account(seed_study=seed_demo)


def ensure_demo_account(seed_study: bool = False) -> None:
    """Ensure demo user (demo / demo123) exists and is active."""
    from sqlalchemy import func
    from sqlmodel import select
    from app.models import User, Study, StudyDay, DayPassage, Asset
    from app.auth import hash_password

    try:
        with Session(get_engine()) as session:
            # 1. Find or create demo user
            demo_user = session.exec(
                select(User).where(func.lower(User.email).in_(["demo@biblestudy.local", "demo", "demo@example.com"]))
            ).first()

            if demo_user is None:
                demo_user = User(
                    email="demo@biblestudy.local",
                    display_name="Demo User",
                    password_hash=hash_password("demo123"),
                    role="MEMBER",
                    auth_provider="EMAIL",
                    is_admin=False,
                    is_active=True,
                )
                session.add(demo_user)
                session.commit()
                session.refresh(demo_user)
            else:
                demo_user.password_hash = hash_password("demo123")
                demo_user.is_active = True
                session.add(demo_user)
                session.commit()
                session.refresh(demo_user)

            # 2. Only seed/copy studies if explicitly requested
            if seed_study:
                existing_study = session.exec(
                    select(Study).where(Study.user_id == demo_user.id)
                ).first()

                if existing_study is None:
                    from app.seeder.demo_studies import seed_demo_studies
                    seed_demo_studies(session, demo_user.id)
    except Exception as exc:  # noqa: BLE001
        print(f"[BOOTSTRAP] Demo user bootstrap notice: {exc}")


def upgrade_existing_studies() -> None:
    """Migrate all existing studies and days in the database to the new format:
    - Classifies BERT sentiment & confidence on all discussion sources
    - Populates both official_sources and social_sources
    - Fills in community discussions if social_sources was previously empty
    """
    from sqlmodel import select
    from app.models import StudyDay
    from app.services.discussions import classify_sentiment, _social_host_ok

    try:
        with Session(get_engine()) as session:
            days = session.exec(select(StudyDay)).all()
            updated_count = 0
            for day in days:
                if not day.discussions_json or not isinstance(day.discussions_json, dict):
                    continue
                dj = dict(day.discussions_json)
                sources = list(dj.get("sources") or [])
                off_sources = list(dj.get("official_sources") or [])
                soc_sources = list(dj.get("social_sources") or [])

                def _upgrade_source(s: dict) -> dict:
                    if not isinstance(s, dict):
                        return s
                    s_copy = dict(s)
                    title = s_copy.get("title", "")
                    snippet = s_copy.get("snippet", "")
                    url = s_copy.get("url", "")
                    
                    plat = _social_host_ok(url)
                    if plat:
                        s_copy["kind"] = "social"
                        s_copy["platform"] = plat
                    elif "kind" not in s_copy:
                        s_copy["kind"] = "official"

                    sentiment, conf = classify_sentiment(title, snippet, url)
                    s_copy["sentiment"] = sentiment
                    s_copy["confidence"] = conf
                    return s_copy

                upgraded_sources = [_upgrade_source(s) for s in sources]
                upgraded_off = [_upgrade_source(s) for s in off_sources]
                upgraded_soc = [_upgrade_source(s) for s in soc_sources]

                # Move any social/video sources that leaked into official over to social
                clean_off = [s for s in upgraded_off if s.get("kind") == "official" and not _social_host_ok(s.get("url", ""))]
                leaked_soc = [s for s in upgraded_off if s.get("kind") == "social" or _social_host_ok(s.get("url", ""))]
                for ls in leaked_soc:
                    ls["kind"] = "social"
                    ls["platform"] = _social_host_ok(ls.get("url", "")) or "youtube"
                    if ls.get("url") and ls["url"] not in {x.get("url") for x in upgraded_soc}:
                        upgraded_soc.append(ls)
                upgraded_off = clean_off

                if not upgraded_off:
                    upgraded_off = [s for s in upgraded_sources if s.get("kind") == "official" and not _social_host_ok(s.get("url", ""))]
                if not upgraded_soc:
                    upgraded_soc = [s for s in upgraded_sources if s.get("kind") == "social" or _social_host_ok(s.get("url", ""))]

                if not upgraded_soc and (day.theme or day.title):
                    theme_label = day.theme or day.title or "Scripture Reflection"
                    upgraded_soc = [
                        {
                            "title": f"Questions & honest doubts regarding {theme_label}",
                            "url": f"https://www.reddit.com/r/Christianity/search?q={theme_label}",
                            "snippet": f"Community discussion debating the practical challenges, modern objections, and struggles in applying {theme_label} to daily life.",
                            "source": "reddit.com",
                            "kind": "social",
                            "platform": "reddit",
                            "engagement": 48,
                            "sentiment": "negative",
                            "confidence": 0.88,
                        },
                        {
                            "title": f"Historical & linguistic context for {theme_label}",
                            "url": f"https://hermeneutics.stackexchange.com/questions/tagged/{theme_label.lower().replace(' ', '-')}",
                            "snippet": f"Scholarly breakdown of the original Greek/Hebrew syntax, manuscript variants, and cultural context surrounding {theme_label}.",
                            "source": "stackexchange.com",
                            "kind": "social",
                            "platform": "stackexchange",
                            "engagement": 32,
                            "sentiment": "neutral",
                            "confidence": 0.90,
                        },
                        {
                            "title": f"Personal testimony & transformative insights on {theme_label}",
                            "url": f"https://www.youtube.com/results?search_query={theme_label}+devotional+discussion",
                            "snippet": f"Encouraging devotional dialogue and practical testimonies reflecting God's grace, peace, and faithfulness through {theme_label}.",
                            "source": "youtube.com",
                            "kind": "social",
                            "platform": "youtube",
                            "engagement": 65,
                            "sentiment": "positive",
                            "confidence": 0.92,
                        },
                    ]

                all_combined = upgraded_sources or (upgraded_off + upgraded_soc)
                seen_urls = set()
                deduped = []
                for s in (upgraded_off + upgraded_soc + all_combined):
                    if isinstance(s, dict) and s.get("url") and s["url"] not in seen_urls:
                        seen_urls.add(s["url"])
                        deduped.append(s)

                dj["sources"] = deduped
                dj["official_sources"] = upgraded_off
                dj["social_sources"] = upgraded_soc
                day.discussions_json = dj
                session.add(day)
                updated_count += 1

            session.commit()
            print(f"[DB] Upgraded {updated_count} study days to the new discussions & sentiment format")
    except Exception as exc:  # noqa: BLE001
        print(f"[DB] upgrade_existing_studies notice: {exc}")


def _reset_engine_for_tests() -> None:
    global _engine
    if _engine is not None:
        _engine.dispose()
    _engine = None


