"""Database schema.

AUTH-FORWARD RULE (plan decision 1): Study, Asset, Setting and UsageLedger all
carry a NULLABLE user_id from this first migration. Single-user local runs leave
it NULL. Phase 7 adds a User table and backfills - purely additive, no rewrites.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import Column, Index, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, SQLModel


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


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
    translation_id: int = Field(foreign_key="translation.id", index=True)
    book_number: int = Field(index=True)
    chapter: int
    verse: int
    text: str
    words_of_jesus: bool = Field(default=False)


# ---------------------------------------------------------------------- Studies

class Study(SQLModel, table=True):
    __tablename__ = "study"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: Optional[int] = Field(default=None, index=True)   # Phase 7
    topic: str = Field(max_length=300)
    minutes_per_day: int
    total_days: int
    tradition: str = Field(default="non_denominational", max_length=40)
    imagery_policy: str = Field(default="symbolic", max_length=24)
    primary_translation: str = Field(default="KJV", max_length=32)
    status: str = Field(default="pending", max_length=24)  # pending|generating|ready|failed
    outline_json: Optional[dict[str, Any]] = Field(default=None, sa_column=Column(JSONB))
    error: Optional[str] = Field(default=None, max_length=1000)
    created_at: datetime = Field(default_factory=utcnow)


class StudyDay(SQLModel, table=True):
    __tablename__ = "study_day"
    __table_args__ = (UniqueConstraint("study_id", "day_number", name="uq_study_day"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    study_id: int = Field(foreign_key="study.id", index=True)
    day_number: int
    title: str = Field(default="", max_length=300)
    theme: str = Field(default="", max_length=500)
    est_minutes: int = Field(default=0)
    status: str = Field(default="pending", max_length=24)
    blocks_json: Optional[list[Any]] = Field(default=None, sa_column=Column(JSONB))
    # Decision 5: rolling continuity summary (<=120 words), day N sees day N-1's.
    context_summary: str = Field(default="", max_length=1200)
    created_at: datetime = Field(default_factory=utcnow)


class DayPassage(SQLModel, table=True):
    __tablename__ = "day_passage"

    id: Optional[int] = Field(default=None, primary_key=True)
    study_day_id: int = Field(foreign_key="study_day.id", index=True)
    ref_book: int
    ref_chapter: int
    ref_verse_start: int
    ref_verse_end: int
    rationale: str = Field(default="", max_length=800)
    is_primary: bool = Field(default=True)


class Asset(SQLModel, table=True):
    __tablename__ = "asset"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: Optional[int] = Field(default=None, index=True)   # Phase 7
    study_day_id: int = Field(foreign_key="study_day.id", index=True)
    kind: str = Field(max_length=24)      # image|infographic|video|audio
    provider: str = Field(default="", max_length=40)
    model: str = Field(default="", max_length=120)
    prompt: str = Field(default="")
    file_path: str = Field(default="", max_length=500)
    cost_usd: float = Field(default=0.0)
    status: str = Field(default="queued", max_length=24)
    error: Optional[str] = Field(default=None, max_length=1000)
    created_at: datetime = Field(default_factory=utcnow)


# --------------------------------------------------------- Settings / telemetry

class Setting(SQLModel, table=True):
    __tablename__ = "setting"
    __table_args__ = (UniqueConstraint("user_id", "key", name="uq_setting_user_key"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: Optional[int] = Field(default=None, index=True)   # Phase 7
    key: str = Field(index=True, max_length=80)
    value_json: Optional[dict[str, Any]] = Field(default=None, sa_column=Column(JSONB))
    is_secret: bool = Field(default=False)


class UsageLedger(SQLModel, table=True):
    __tablename__ = "usage_ledger"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: Optional[int] = Field(default=None, index=True)   # Phase 7
    ts: datetime = Field(default_factory=utcnow, index=True)
    job_kind: str = Field(max_length=40)
    provider: str = Field(default="", max_length=40)
    model: str = Field(default="", max_length=120)
    cost_usd: float = Field(default=0.0)
    study_id: Optional[int] = Field(default=None, index=True)


class Event(SQLModel, table=True):
    """Durable mirror of the StatusDock running log."""
    __tablename__ = "event"

    id: Optional[int] = Field(default=None, primary_key=True)
    ts: datetime = Field(default_factory=utcnow, index=True)
    level: str = Field(default="info", max_length=16)
    scope: str = Field(default="", max_length=40)
    message: str = Field(default="")
    cost_usd: Optional[float] = Field(default=None)
    study_id: Optional[int] = Field(default=None, index=True)
