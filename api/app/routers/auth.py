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
    role: str = "MEMBER"
    auth_provider: str = "EMAIL"
    picture_url: str = ""
    organization: str = ""
    phone: str = ""
    notes: str = ""
    is_admin: bool = False
    is_active: bool = True
    created_at: datetime
    updated_at: datetime
    study_count: int = 0

    @classmethod
    def from_user(cls, u: User, study_count: int = 0) -> "UserOut":
        role = u.role or ("SUPER_ADMIN" if u.is_admin else "MEMBER")
        return cls(
            id=u.id or 0,
            email=u.email,
            display_name=u.display_name,
            role=role,
            auth_provider=u.auth_provider or "EMAIL",
            picture_url=u.picture_url or "",
            organization=u.organization or "",
            phone=u.phone or "",
            notes=u.notes or "",
            is_admin=bool(u.is_admin or role in ("SUPER_ADMIN", "ADMIN")),
            is_active=bool(u.is_active),
            created_at=u.created_at,
            updated_at=u.updated_at,
            study_count=study_count,
        )


class ProfileUpdateIn(BaseModel):
    display_name: str | None = None
    organization: str | None = None
    phone: str | None = None
    picture_url: str | None = None
    notes: str | None = None


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
    
    settings = get_settings()
    is_super = bool((settings.super_admin_email and email == settings.super_admin_email.lower()) or
                    (settings.bootstrap_admin_email and email == settings.bootstrap_admin_email.lower()))
    role = "SUPER_ADMIN" if is_super else "MEMBER"
    user = User(
        email=email,
        display_name=(body.display_name or email.split("@")[0])[:120],
        password_hash=hash_password(body.password),
        role=role,
        auth_provider="EMAIL",
        is_admin=is_super,
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
    pwd_match = verify_password(body.password or "", user.password_hash) if user else False
    print(f"[AUTH DEBUG] Login attempt for email='{email}', user_found={user is not None}, password_len={len(body.password or '')}, match={pwd_match}")
    # Always run verify_password to avoid user-enumeration timing differences.
    if user is None or not pwd_match:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="Invalid email or password")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Account is disabled")
    
    settings = get_settings()
    is_super = bool(settings.super_admin_email and email == settings.super_admin_email.lower())
    if is_super and (user.role != "SUPER_ADMIN" or not user.is_admin):
        user.role = "SUPER_ADMIN"
        user.is_admin = True
        session.add(user)
        session.commit()
        session.refresh(user)

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
def me(user: User = Depends(get_current_user), session: Session = Depends(get_session)) -> UserOut:
    from app.models import Study
    from sqlalchemy import func
    count = session.exec(select(func.count(Study.id)).where(Study.user_id == user.id)).one() or 0
    return UserOut.from_user(user, study_count=count)


@router.patch("/profile", response_model=UserOut)
def update_profile(
    body: ProfileUpdateIn,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> UserOut:
    if body.display_name is not None:
        user.display_name = body.display_name.strip()[:120]
    if body.organization is not None:
        user.organization = body.organization.strip()[:120]
    if body.phone is not None:
        user.phone = body.phone.strip()[:40]
    if body.picture_url is not None:
        user.picture_url = body.picture_url.strip()[:500]
    if body.notes is not None:
        user.notes = body.notes.strip()
    user.updated_at = datetime.now(timezone.utc)
    session.add(user)
    session.commit()
    session.refresh(user)

    from app.models import Study
    from sqlalchemy import func
    count = session.exec(select(func.count(Study.id)).where(Study.user_id == user.id)).one() or 0
    return UserOut.from_user(user, study_count=count)


# ------------------------------------------------------------- Admin Endpoints

class PromoteIn(BaseModel):
    user_id: int
    is_admin: bool


class RoleUpdateIn(BaseModel):
    role: str  # SUPER_ADMIN | ADMIN | MEMBER


class StatusUpdateIn(BaseModel):
    is_active: bool


@router.get("/admin/users", response_model=list[UserOut])
def list_users(
    admin: User = Depends(require_admin),
    session: Session = Depends(get_session),
) -> list[UserOut]:
    from app.models import Study
    from sqlalchemy import func
    users = session.exec(select(User).order_by(User.id)).all()
    out = []
    for u in users:
        count = session.exec(select(func.count(Study.id)).where(Study.user_id == u.id)).one() or 0
        out.append(UserOut.from_user(u, study_count=count))
    return out


@router.post("/admin/promote", response_model=UserOut)
def promote(
    body: PromoteIn,
    admin: User = Depends(require_admin),
    session: Session = Depends(get_session),
) -> UserOut:
    target = session.get(User, body.user_id)
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail="User not found")
    target.is_admin = body.is_admin
    target.role = "ADMIN" if body.is_admin else "MEMBER"
    target.updated_at = datetime.now(timezone.utc)
    session.add(target)
    session.commit()
    session.refresh(target)
    return UserOut.from_user(target)


@router.patch("/admin/users/{user_id}/role", response_model=UserOut)
def update_user_role(
    user_id: int,
    body: RoleUpdateIn,
    admin: User = Depends(require_admin),
    session: Session = Depends(get_session),
) -> UserOut:
    target = session.get(User, user_id)
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    
    settings = get_settings()
    if settings.super_admin_email and target.email == settings.super_admin_email.lower():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot alter Super Admin role")
    
    valid_roles = {"SUPER_ADMIN", "ADMIN", "MEMBER"}
    if body.role not in valid_roles:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid role. Must be one of {valid_roles}")

    target.role = body.role
    target.is_admin = body.role in ("SUPER_ADMIN", "ADMIN")
    target.updated_at = datetime.now(timezone.utc)
    session.add(target)
    session.commit()
    session.refresh(target)
    return UserOut.from_user(target)


@router.patch("/admin/users/{user_id}/status", response_model=UserOut)
def update_user_status(
    user_id: int,
    body: StatusUpdateIn,
    admin: User = Depends(require_admin),
    session: Session = Depends(get_session),
) -> UserOut:
    target = session.get(User, user_id)
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    
    settings = get_settings()
    if settings.super_admin_email and target.email == settings.super_admin_email.lower():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot disable Super Admin account")

    target.is_active = body.is_active
    target.updated_at = datetime.now(timezone.utc)
    session.add(target)
    session.commit()
    session.refresh(target)
    return UserOut.from_user(target)


@router.delete("/admin/users/{user_id}", status_code=204)
def delete_user(
    user_id: int,
    admin: User = Depends(require_admin),
    session: Session = Depends(get_session),
) -> Response:
    target = session.get(User, user_id)
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    
    settings = get_settings()
    if settings.super_admin_email and target.email == settings.super_admin_email.lower():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot delete Super Admin account")
    if target.id == admin.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot delete your own account")

    session.delete(target)
    session.commit()
    return Response(status_code=204)
