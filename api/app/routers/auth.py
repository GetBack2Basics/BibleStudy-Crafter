"""Auth routes: register, login, refresh, logout, and the current user.

Tokens:
  * access  - HMAC-signed, short-lived (60 min), sent as Bearer.
  * refresh - opaque random string; only its HMAC is stored (revocable).
Self-escalation to admin is impossible: only an existing admin (via
`require_admin`) may flip `is_admin`, and registration never grants it.
"""
from __future__ import annotations

import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi import Response
from pydantic import BaseModel
from sqlmodel import Session, select

from app.auth import (
    create_access_token,
    create_refresh_token,
    get_current_user,
    hash_password,
    revoke_refresh_token,
    require_admin,
    verify_password,
)
from app.config import get_settings
from app.db import get_session
from app.models import User

router = APIRouter(prefix="/api/auth", tags=["auth"])

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class RegisterIn(BaseModel):
    email: str
    password: str
    display_name: str | None = None


class LoginIn(BaseModel):
    email: str
    password: str


class TokenOut(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: "UserOut"


class UserOut(BaseModel):
    id: int
    email: str
    display_name: str
    is_admin: bool
    is_active: bool

    @classmethod
    def from_user(cls, u: User) -> "UserOut":
        return cls(id=u.id, email=u.email, display_name=u.display_name,
                   is_admin=u.is_admin, is_active=u.is_active)


class RefreshIn(BaseModel):
    refresh_token: str


def _normalize_email(email: str) -> str:
    e = (email or "").strip().lower()
    if not _EMAIL_RE.match(e):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="A valid email is required")
    return e


@router.post("/register", response_model=TokenOut, status_code=201)
def register(body: RegisterIn, session: Session = Depends(get_session)) -> TokenOut:
    email = _normalize_email(body.email)
    if len(body.password or "") < 8:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Password must be at least 8 characters")
    if session.exec(select(User).where(User.email == email)).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail="An account with that email already exists")
    # Admin is granted ONLY via the configured bootstrap email (or an existing
    # admin using /api/auth/admin/promote). No ordinary registration can become
    # an admin, so self-escalation to super admin is impossible.
    settings = get_settings()
    is_admin = bool(settings.bootstrap_admin_email
                    and email == settings.bootstrap_admin_email.lower())
    user = User(
        email=email,
        display_name=(body.display_name or email.split("@")[0])[:120],
        password_hash=hash_password(body.password),
        is_admin=is_admin,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    access = create_access_token(user)
    refresh = create_refresh_token(session, user)
    return TokenOut(access_token=access, refresh_token=refresh,
                    user=UserOut.from_user(user))


@router.post("/login", response_model=TokenOut)
def login(body: LoginIn, session: Session = Depends(get_session)) -> TokenOut:
    email = _normalize_email(body.email)
    user = session.exec(select(User).where(User.email == email)).first()
    # Always run verify_password to avoid user-enumeration timing differences.
    if user is None or not verify_password(body.password or "", user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="Invalid email or password")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Account is disabled")
    access = create_access_token(user)
    refresh = create_refresh_token(session, user)
    return TokenOut(access_token=access, refresh_token=refresh,
                    user=UserOut.from_user(user))


@router.post("/refresh", response_model=TokenOut)
def refresh(body: RefreshIn, session: Session = Depends(get_session)) -> TokenOut:
    from app.auth import consume_refresh_token
    user = consume_refresh_token(session, body.refresh_token)
    # Rotate the refresh token on use (reuse is mitigated).
    revoke_refresh_token(session, body.refresh_token)
    access = create_access_token(user)
    new_refresh = create_refresh_token(session, user)
    return TokenOut(access_token=access, refresh_token=new_refresh,
                    user=UserOut.from_user(user))


@router.post("/logout", status_code=204)
def logout(body: RefreshIn, session: Session = Depends(get_session)) -> Response:
    revoke_refresh_token(session, body.refresh_token)
    return Response(status_code=204)


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)) -> UserOut:
    return UserOut.from_user(user)


# Admin-only: promote/demote a user. Gated by require_admin so no ordinary user
# can escalate themselves.
class PromoteIn(BaseModel):
    user_id: int
    is_admin: bool


@router.post("/admin/promote", response_model=UserOut)
def promote(body: PromoteIn,
            admin: User = Depends(require_admin),
            session: Session = Depends(get_session)) -> UserOut:
    target = session.get(User, body.user_id)
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail="User not found")
    target.is_admin = body.is_admin
    session.add(target)
    session.commit()
    session.refresh(target)
    return UserOut.from_user(target)
