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
    ]
    with engine.connect() as conn:
        for sql in stmts:
            try:
                conn.execute(text(sql))
            except Exception:  # noqa: BLE001 - schema drift must never crash startup
                pass
        conn.commit()


def _reset_engine_for_tests() -> None:
    global _engine
    if _engine is not None:
        _engine.dispose()
    _engine = None
