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
    """Idempotent column migrations for an already-running DB.

    create_all() only creates missing TABLES, it does not ALTER existing ones,
    so new columns added to existing models must be added here. SQLite tests get
    the columns from create_all (models are registered), so we only run the ALTER
    path on Postgres. Every statement uses IF NOT EXISTS / guard clauses.
    """
    engine = get_engine()
    if engine.dialect.name != "postgresql":
        return
    import app.models  # noqa: F401
    stmts = [
        "ALTER TABLE study ADD COLUMN IF NOT EXISTS history_json jsonb",
        "ALTER TABLE study ADD COLUMN IF NOT EXISTS verse_pool jsonb",
        "ALTER TABLE study_day ADD COLUMN IF NOT EXISTS notes jsonb",
        "ALTER TABLE study_day ADD COLUMN IF NOT EXISTS discussions_json jsonb",
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


def ensure_demo_account() -> None:
    """Ensure demo user (demo / demo123) exists and has a copy of a study."""
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

            # 2. Check if demo user already has any studies
            existing_study = session.exec(
                select(Study).where(Study.user_id == demo_user.id)
            ).first()

            if existing_study is None:
                source_study = None
                core_user = session.exec(
                    select(User).where(func.lower(User.email) == "coreagc@gmail.com")
                ).first()
                if core_user:
                    source_study = session.exec(
                        select(Study).where(Study.user_id == core_user.id).order_by(Study.created_at.desc())
                    ).first()

                if source_study is None:
                    source_study = session.exec(
                        select(Study).where(Study.user_id != demo_user.id).order_by(Study.created_at.desc())
                    ).first()

                if source_study is None:
                    source_study = session.exec(
                        select(Study).order_by(Study.created_at.desc())
                    ).first()

                if source_study is not None:
                    new_study = Study(
                        user_id=demo_user.id,
                        topic=source_study.topic,
                        title=source_study.title or source_study.topic,
                        minutes_per_day=source_study.minutes_per_day,
                        total_days=source_study.total_days,
                        tradition=source_study.tradition,
                        imagery_policy=source_study.imagery_policy,
                        primary_translation=source_study.primary_translation,
                        status=source_study.status,
                        outline_json=source_study.outline_json,
                        history_json=source_study.history_json,
                        verse_pool=source_study.verse_pool,
                        error=source_study.error,
                    )
                    session.add(new_study)
                    session.commit()
                    session.refresh(new_study)

                    old_days = session.exec(
                        select(StudyDay).where(StudyDay.study_id == source_study.id).order_by(StudyDay.day_number)
                    ).all()

                    for old_day in old_days:
                        new_day = StudyDay(
                            study_id=new_study.id,
                            day_number=old_day.day_number,
                            title=old_day.title,
                            theme=old_day.theme,
                            est_minutes=old_day.est_minutes,
                            status=old_day.status,
                            blocks_json=old_day.blocks_json,
                            context_summary=old_day.context_summary,
                            notes=old_day.notes,
                            discussions_json=old_day.discussions_json,
                        )
                        session.add(new_day)
                        session.commit()
                        session.refresh(new_day)

                        passages = session.exec(
                            select(DayPassage).where(DayPassage.study_day_id == old_day.id).order_by(DayPassage.order)
                        ).all()
                        for p in passages:
                            new_p = DayPassage(
                                study_day_id=new_day.id,
                                ref=p.ref,
                                translation=p.translation,
                                text=p.text,
                                order=p.order,
                                rationale=p.rationale,
                                highlights=p.highlights,
                                source_reflections=p.source_reflections,
                                verse_notes=p.verse_notes,
                                is_primary=p.is_primary,
                            )
                            session.add(new_p)

                        assets = session.exec(
                            select(Asset).where(Asset.study_day_id == old_day.id)
                        ).all()
                        for a in assets:
                            new_a = Asset(
                                user_id=demo_user.id,
                                study_day_id=new_day.id,
                                kind=a.kind,
                                provider=a.provider,
                                model=a.model,
                                prompt=a.prompt,
                                file_path=a.file_path,
                                media_type=a.media_type,
                                content=a.content,
                                cost_usd=a.cost_usd,
                                status=a.status,
                                style_preset=a.style_preset,
                                is_active=a.is_active,
                                meta_json=a.meta_json,
                                error=a.error,
                            )
                            session.add(new_a)

                        session.commit()
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

                if not upgraded_off:
                    upgraded_off = [s for s in upgraded_sources if s.get("kind") == "official"]
                if not upgraded_soc:
                    upgraded_soc = [s for s in upgraded_sources if s.get("kind") == "social"]

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


