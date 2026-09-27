"""Media Storage Service (Local Filesystem + Google Cloud Storage).

Seamlessly switches between:
  1. Local disk storage (development / Docker Compose `/media`)
  2. Google Cloud Storage (production deployment via GCS_BUCKET_NAME)
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Optional

from app.config import get_settings
from app.services import events


def get_storage_type() -> str:
    settings = get_settings()
    if getattr(settings, "gcs_bucket_name", None):
        return "gcs"
    return "local"


def save_media_file(
    relative_path: str,
    content: bytes,
    content_type: str = "application/octet-stream",
) -> str:
    """Save content to storage and return the accessible URI/path."""
    settings = get_settings()
    bucket_name = getattr(settings, "gcs_bucket_name", "").strip()

    if bucket_name:
        try:
            from google.cloud import storage
            client = storage.Client()
            bucket = client.bucket(bucket_name)
            blob = bucket.blob(relative_path.lstrip("/"))
            blob.upload_from_string(content, content_type=content_type)
            return f"https://storage.googleapis.com/{bucket_name}/{relative_path.lstrip('/')}"
        except Exception as exc:
            events.emit("warn", "storage", f"GCS upload failed, falling back to local disk: {exc}")

    # Fallback / Default: Local disk
    local_root = Path(settings.media_root)
    full_path = local_root / relative_path.lstrip("/")
    full_path.parent.mkdir(parents=True, exist_ok=True)
    full_path.write_bytes(content)
    return f"/media/{relative_path.lstrip('/')}"


def read_media_file(path_or_url: str) -> bytes:
    """Read media bytes from local disk or GCS."""
    settings = get_settings()
    bucket_name = getattr(settings, "gcs_bucket_name", "").strip()

    if path_or_url.startswith("https://storage.googleapis.com/") or (bucket_name and not path_or_url.startswith("/")):
        try:
            from google.cloud import storage
            client = storage.Client()
            # Extract relative blob name
            blob_name = path_or_url.replace(f"https://storage.googleapis.com/{bucket_name}/", "").lstrip("/")
            bucket = client.bucket(bucket_name)
            blob = bucket.blob(blob_name)
            return blob.download_as_bytes()
        except Exception as exc:
            events.emit("error", "storage", f"GCS download failed: {exc}")
            raise

    # Local file read
    clean_path = path_or_url.replace("/media/", "")
    local_path = Path(settings.media_root) / clean_path.lstrip("/")
    return local_path.read_bytes()
