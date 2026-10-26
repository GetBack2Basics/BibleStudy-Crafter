"""Database schema.

Unified schema: User accounts, studies, daily content, scripture passages,
assets, settings, and telemetry with clean foreign keys, cascading deletions,
indexing, and dual JSONB/JSON support.
"""
from datetime import datetime, timezone
from typing import Any, List, Optional

from sqlalchemy import Column, Index, LargeBinary, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.types import JSON
from sqlmodel import Field, Relationship, SQLModel

# JSONB on Postgres, plain JSON elsewhere (SQLite in tests & local dev).
JSON_TYPE = JSONB().with_variant(JSON(), "sqlite")


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------- Accounts

class User(SQLModel, table=True):
    """An authenticated account."""
    __tablename__ = "user_account"

    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(max_length=320, index=True, unique=True)
    display_name: str = Field(max_length=120, default="")
    # scrypt hash: "scrypt$N$r$p$<salt_hex>$<hash_hex>" (see app.auth)
    password_hash: str = Field(default="")
    role: str = Field(default="MEMBER", max_length=20)  # SUPER_ADMIN | ADMIN | MEMBER
    auth_provider: str = Field(default="EMAIL", max_length=20)  # EMAIL | GOOGLE
    picture_url: str = Field(default="", max_length=500)
    organization: str = Field(default="", max_length=120)
    phone: str = Field(default="", max_length=40)
    notes: str = Field(default="")
    is_admin: bool = Field(default=False)
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)

    studies: List["Study"] = Relationship(
        back_populates="owner", sa_relationship_kwargs={"cascade": "all, delete-orphan"}
    )
    refresh_tokens: List["RefreshToken"] = Relationship(
        back_populates="user", sa_relationship_kwargs={"cascade": "all, delete-orphan"}
    )
    assets: List["Asset"] = Relationship(
        back_populates="owner", sa_relationship_kwargs={"cascade": "all, delete-orphan"}
    )
    settings: List["Setting"] = Relationship(
        back_populates="user", sa_relationship_kwargs={"cascade": "all, delete-orphan"}
    )


class RefreshToken(SQLModel, table=True):
    """Opaque refresh tokens (HMAC-signed, stored for revocation)."""
    __tablename__ = "refresh_token"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user_account.id", index=True, ondelete="CASCADE")
    token_hash: str = Field(index=True, unique=True)   # HMAC of the opaque token
    expires_at: datetime = Field(default=None)
    created_at: datetime = Field(default_factory=utcnow)

    user: Optional[User] = Relationship(back_populates="refresh_tokens")


# ---------------------------------------------------------------- Bible corpus

class Translation(SQLModel, table=True):
    __tablename__ = "translation"

    id: Optional[int] = Field(default=None, primary_key=True)
    code: str = Field(index=True, unique=True, max_length=32)      # e.g. "KJV"
    source_id: str = Field(max_length=64)                          # helloao id e.g. "eng_kjv"
    name: str = Field(max_length=200)
    language: str = Field(default="eng", max_length=16)
    license_url: str = Field(default="", max_length=500)
    website: str = Field(default="", max_length=500)
    verse_count: int = Field(default=0)
    created_at: datetime = Field(default_factory=utcnow)

    verses: List["Verse"] = Relationship(
        back_populates="translation", sa_relationship_kwargs={"cascade": "all, delete-orphan"}
    )


class Book(SQLModel, table=True):
    """Canonical book list, shared across translations (66-book protestant order)."""
    __tablename__ = "book"

    id: Optional[int] = Field(default=None, primary_key=True)
    number: int = Field(index=True, unique=True)     # 1=Genesis .. 66=Revelation
    code: str = Field(index=True, max_length=8)      # helloao USFM id, e.g. "JHN"
    name: str = Field(max_length=64)                 # "John"
    testament: str = Field(max_length=2)             # "OT" | "NT"
    chapter_count: int = Field(default=0)


class Verse(SQLModel, table=True):
    __tablename__ = "verse"
    __table_args__ = (
        UniqueConstraint("translation_id", "book_number", "chapter", "verse",
                         name="uq_verse_location"),
        Index("ix_verse_lookup", "translation_id", "book_number", "chapter"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    translation_id: int = Field(foreign_key="translation.id", index=True, ondelete="CASCADE")
    book_number: int = Field(index=True)
    chapter: int
    verse: int
    text: str
    words_of_jesus: bool = Field(default=False)

    translation: Optional[Translation] = Relationship(back_populates="verses")


# ---------------------------------------------------------------------- Studies

class Study(SQLModel, table=True):
    __tablename__ = "study"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: Optional[int] = Field(default=None, index=True, foreign_key="user_account.id", ondelete="CASCADE")
    topic: str = Field(max_length=300)
    title: str = Field(default="", max_length=300)   # set from the generated outline
    minutes_per_day: int
    total_days: int
    tradition: str = Field(default="non_denominational", max_length=40)
    imagery_policy: str = Field(default="symbolic", max_length=24)
    primary_translation: str = Field(default="KJV", max_length=32)
    status: str = Field(default="pending", max_length=24, index=True)  # pending|generating|ready|failed
    outline_json: Optional[dict[str, Any]] = Field(default=None, sa_column=Column(JSON_TYPE))
    # Compressed rolling history (plan decision): day N reads ALL prior days via
    # {"arc": str (compressed overall), "recent": [{"day": int, "summary": str}]}.
    history_json: Optional[dict[str, Any]] = Field(default=None, sa_column=Column(JSON_TYPE))
    # Curated verse pool chosen by the user at create time (refs from corpus search).
    verse_pool: Optional[list[str]] = Field(default=None, sa_column=Column(JSON_TYPE))
    error: Optional[str] = Field(default=None, max_length=1000)
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)

    days: List["StudyDay"] = Relationship(
        back_populates="study", sa_relationship_kwargs={"cascade": "all, delete-orphan", "order_by": "StudyDay.day_number"}
    )
    owner: Optional["User"] = Relationship(back_populates="studies")


class StudyDay(SQLModel, table=True):
    __tablename__ = "study_day"
    __table_args__ = (UniqueConstraint("study_id", "day_number", name="uq_study_day"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    study_id: int = Field(foreign_key="study.id", index=True, ondelete="CASCADE")
    day_number: int
    title: str = Field(default="", max_length=300)
    theme: str = Field(default="", max_length=500)
    est_minutes: int = Field(default=0)
    status: str = Field(default="pending", max_length=24, index=True)
    blocks_json: Optional[Any] = Field(default=None, sa_column=Column(JSON_TYPE))
    context_summary: str = Field(default="", max_length=1200)
    notes: Optional[dict[str, Any]] = Field(default=None, sa_column=Column(JSON_TYPE))
    discussions_json: Optional[Any] = Field(default=None, sa_column=Column(JSON_TYPE))
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)

    study: Optional["Study"] = Relationship(back_populates="days")
    passages: List["DayPassage"] = Relationship(
        back_populates="study_day", sa_relationship_kwargs={"cascade": "all, delete-orphan", "order_by": "DayPassage.order"}
    )
    assets: List["Asset"] = Relationship(
        back_populates="study_day", sa_relationship_kwargs={"cascade": "all, delete-orphan"}
    )


class DayPassage(SQLModel, table=True):
    __tablename__ = "day_passage"
    __table_args__ = (
        Index("ix_day_passage_order", "study_day_id", "order"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    study_day_id: int = Field(foreign_key="study_day.id", index=True, ondelete="CASCADE")
    ref: str = Field(max_length=64)            # e.g. "Mark 4:35-41"
    translation: str = Field(default="KJV", max_length=32)  # per-quote version
    text: str = Field(default="")               # resolved text in `translation`
    order: int = Field(default=0)
    rationale: str = Field(default="", max_length=800)
    highlights: Any = Field(default=None, sa_column=Column(JSON_TYPE))  # [{text, note}]
    source_reflections: Any = Field(default=None, sa_column=Column(JSON_TYPE))
    # [{text, note, source_url, source_title}] — highlights captured from an external source reader
    verse_notes: Any = Field(default=None, sa_column=Column(JSON_TYPE))
    # [{verse: int, id: str, content: str}] — per-verse personal notes (markdown-light)
    is_primary: bool = Field(default=True)

    study_day: Optional["StudyDay"] = Relationship(back_populates="passages")


class Asset(SQLModel, table=True):
    __tablename__ = "asset"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: Optional[int] = Field(default=None, index=True, foreign_key="user_account.id", ondelete="CASCADE")
    study_day_id: int = Field(foreign_key="study_day.id", index=True, ondelete="CASCADE")
    kind: str = Field(max_length=24, index=True)      # image|infographic|video|audio|cover_art
    provider: str = Field(default="", max_length=40)
    model: str = Field(default="", max_length=120)
    prompt: str = Field(default="")
    file_path: str = Field(default="", max_length=500)
    media_type: str = Field(default="", max_length=120)
    content: bytes = Field(default=b"")
    cost_usd: float = Field(default=0.0)
    status: str = Field(default="queued", max_length=24, index=True)
    style_preset: str = Field(default="", max_length=60)
    is_active: bool = Field(default=True, index=True)
    meta_json: Optional[dict[str, Any]] = Field(default=None, sa_column=Column(JSON_TYPE))
    error: Optional[str] = Field(default=None, max_length=1000)
    created_at: datetime = Field(default_factory=utcnow)

    study_day: Optional["StudyDay"] = Relationship(back_populates="assets")
    owner: Optional["User"] = Relationship(back_populates="assets")


# --------------------------------------------------------- Settings / telemetry

class Setting(SQLModel, table=True):
    __tablename__ = "setting"
    __table_args__ = (UniqueConstraint("user_id", "key", name="uq_setting_user_key"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: Optional[int] = Field(default=None, index=True, foreign_key="user_account.id", ondelete="CASCADE")
    key: str = Field(index=True, max_length=80)
    value_json: Optional[dict[str, Any]] = Field(default=None, sa_column=Column(JSON_TYPE))
    is_secret: bool = Field(default=False)

    user: Optional["User"] = Relationship(back_populates="settings")


class UsageLedger(SQLModel, table=True):
    __tablename__ = "usage_ledger"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: Optional[int] = Field(default=None, index=True, foreign_key="user_account.id", ondelete="CASCADE")
    ts: datetime = Field(default_factory=utcnow, index=True)
    job_kind: str = Field(max_length=40)
    provider: str = Field(default="", max_length=40)
    model: str = Field(default="", max_length=120)
    cost_usd: float = Field(default=0.0)
    study_id: Optional[int] = Field(default=None, index=True, foreign_key="study.id", ondelete="SET NULL")


class Event(SQLModel, table=True):
    """Durable mirror of the StatusDock running log."""
    __tablename__ = "event"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: Optional[int] = Field(default=None, index=True, foreign_key="user_account.id", ondelete="SET NULL")
    study_id: Optional[int] = Field(default=None, index=True, foreign_key="study.id", ondelete="CASCADE")
    ts: datetime = Field(default_factory=utcnow, index=True)
    level: str = Field(default="info", max_length=16)
    scope: str = Field(default="", max_length=40)
    message: str = Field(default="")
    cost_usd: Optional[float] = Field(default=None)
