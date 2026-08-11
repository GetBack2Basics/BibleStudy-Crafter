"""Self-contained authentication - no third-party crypto dependencies.

Design (all stdlib, so the container build stays intact):
  * Passwords: scrypt with a random salt (constant-time, memory-hard).
    Stored as "scrypt$N$r$p$<salt_hex>$<hash_hex>".
  * Access tokens: HMAC-SHA256 signed, base64url payload {uid, exp, admin}.
    Verified by re-computing the HMAC with a server secret (settings.secret_key).
  * Refresh tokens: opaque random string; only its HMAC is stored, so a DB leak
    yields nothing replayable. Revocation = delete the stored row.
  * get_current_user: FastAPI dependency that reads the Bearer token, verifies
    the HMAC + expiry, and loads the User. Raises 401 on any failure.
  * require_admin: dependency that further requires is_admin (used to protect
    any future admin-only route, and to forbid self-escalation).

Why HMAC (not JWT): avoids pulling in python-jose/pyjwt. The secret is the
server's SECRET_KEY; tokens are stateless and cannot be forged without it, and
they expire.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import time
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import delete, select
from sqlmodel import Session

from app.config import get_settings
from app.db import get_session
from app.models import RefreshToken, User

_SCHEME = "Bearer"
_bearer = HTTPBearer(auto_error=False)

# ----------------------------------------------------------- password hashing

def hash_password(password: str) -> str:
    """Return a scrypt hash string. Raises ValueError on a weak password."""
    if not password or len(password) < 8:
        raise ValueError("password must be at least 8 characters")
    salt = secrets.token_bytes(16)
    n, r, p = 16384, 8, 1
    dk = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=n, r=r, p=p,
                         maxmem=0, dklen=64)
    return f"scrypt${n}${r}${p}${salt.hex()}${dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, ns, rs, ps, salt_hex, hash_hex = stored.split("$")
    except ValueError:
        return False
    if scheme != "scrypt":
        return False
    try:
        salt = bytes.fromhex(salt_hex)
        expected = bytes.fromhex(hash_hex)
        n, r, p = int(ns), int(rs), int(ps)
    except ValueError:
        return False
    dk = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=n, r=r, p=p,
                        maxmem=0, dklen=len(expected))
    return hmac.compare_digest(dk, expected)


# --------------------------------------------------------------- access tokens

def _b64url(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode("ascii")


def _b64url_decode(s: str) -> bytes:
    pad = "=" * (-len(s) % 4)
    return base64.urlsafe_b64decode(s + pad)


def _sign(msg: bytes) -> str:
    key = get_settings().secret_key.encode("utf-8")
    return _b64url(hmac.new(key, msg, hashlib.sha256).digest())


def create_access_token(user: User, expires_min: int = 60) -> str:
    payload = {
        "uid": user.id,
        "admin": bool(user.is_admin),
        "exp": int(time.time()) + expires_min * 60,
    }
    body = _b64url(json.dumps(payload).encode("utf-8"))
    return f"{body}.{_sign(body.encode('ascii'))}"


def _verify_access_token(token: str) -> dict:
    try:
        body, sig = token.split(".", 1)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="Malformed token")
    expected = _sign(body.encode("ascii"))
    if not hmac.compare_digest(sig, expected):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="Invalid token signature")
    try:
        payload = json.loads(_b64url_decode(body))
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="Malformed token payload")
    if payload.get("exp", 0) < time.time():
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="Token expired")
    return payload


# -------------------------------------------------------------- refresh tokens

def create_refresh_token(session: Session, user: User,
                         expires_days: int = 30) -> str:
    raw = secrets.token_urlsafe(32)
    token_hash = _hmac_token(raw)
    # Store naive UTC (SQLite has no tz); compare against naive UTC 'now'.
    expires = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(days=expires_days)
    row = RefreshToken(user_id=user.id, token_hash=token_hash, expires_at=expires)
    session.add(row)
    session.commit()
    return raw


def _hmac_token(raw: str) -> str:
    key = get_settings().secret_key.encode("utf-8")
    return _b64url(hmac.new(key, raw.encode("utf-8"), hashlib.sha256).digest())


def consume_refresh_token(session: Session, raw: str) -> User:
    # Column-only selects return plain Rows (not mapped objects), which avoids
    # any ORM mapper quirk around the expires_at column.
    token_hash = _hmac_token(raw)
    row = session.exec(
        select(RefreshToken.user_id, RefreshToken.expires_at).where(
            RefreshToken.token_hash == token_hash)
    ).first()
    if row is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="Invalid refresh token")
    user_id, expires_at = row
    now = datetime.now()  # naive local == naive UTC stored value
    if expires_at is None or expires_at < now:
        # Expired -> revoke and reject.
        session.exec(
            delete(RefreshToken).where(RefreshToken.token_hash == token_hash))
        session.commit()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="Refresh token expired")
    user = session.get(User, user_id)
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="Account unavailable")
    return user


def revoke_refresh_token(session: Session, raw: str) -> None:
    token_hash = _hmac_token(raw)
    # Direct DELETE (no mapped-object read) - robust against mapper quirks.
    session.exec(
        delete(RefreshToken).where(RefreshToken.token_hash == token_hash))
    session.commit()


# ----------------------------------------------------------- FastAPI guards

def get_current_user(
    cred: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
    session: Session = Depends(get_session),
) -> User:
    if cred is None or cred.scheme.lower() != _SCHEME.lower():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid Authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )
    payload = _verify_access_token(cred.credentials)
    user = session.get(User, payload.get("uid"))
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="Account unavailable")
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    """Protect admin-only routes. Prevents any path to self-escalation because
    only an existing admin can reach routes that flip is_admin - and this
    dependency is the gate."""
    if not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Admin privileges required")
    return user
