"""Rebuild the database from scratch with the unified schema.

Usage:
    python -m scripts.rebuild_db
    or from the api directory:
    python scripts/rebuild_db.py
"""
import sys
import os
from pathlib import Path

# Add api directory to sys.path so app modules are resolvable
API_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(API_ROOT))

from sqlmodel import Session, select
from app.config import get_settings
from app.db import get_engine, rebuild_database
from app.models import Book, Translation, User, Study, StudyDay, DayPassage, Asset


def main() -> None:
    settings = get_settings()
    db_url = settings.database_url
    print(f"==================================================")
    print(f"BibleStudy-Crafter Database Rebuilder")
    print(f"Target Database: {db_url}")
    print(f"==================================================")

    print("\n[1/3] Purging and rebuilding schema tables...")
    rebuild_database()
    print("Schema created successfully with cascade foreign keys and updated indexes.")

    print("\n[2/3] Verifying seeded records...")
    engine = get_engine()
    with Session(engine) as session:
        books_count = len(session.exec(select(Book)).all())
        trans_count = len(session.exec(select(Translation)).all())
        users_count = len(session.exec(select(User)).all())
        studies_count = len(session.exec(select(Study)).all())
        days_count = len(session.exec(select(StudyDay)).all())
        passages_count = len(session.exec(select(DayPassage)).all())
        assets_count = len(session.exec(select(Asset)).all())

    print(f"  - Books (Canon): {books_count}")
    print(f"  - Translations: {trans_count}")
    print(f"  - Users: {users_count}")
    print(f"  - Studies: {studies_count}")
    print(f"  - Study Days: {days_count}")
    print(f"  - Day Passages: {passages_count}")
    print(f"  - Media Assets: {assets_count}")

    print("\n[3/3] Rebuild complete! Database is clean and ready.")


if __name__ == "__main__":
    main()
