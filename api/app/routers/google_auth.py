"""Google OAuth login (ID-token, no client secret needed).

Pattern (from the User Profiles & Project Assignments Playbook):
  POST /api/auth/google  { id_token }
    -> verify the Google ID token (tokeninfo endpoint; no extra deps, httpx
       is already a dependency)
    -> find-or-create the local User by the verified email
    -> the ONE super-admin email (settings.super_admin_email) is promoted to
       admin on first sight and stays admin; never self-escalatable otherwise.
    -> return the same TokenOut the email/password routes return.

Why verify server-side: a Google ID token is a JWT signed by Google. We check
  1) the token is valid & unexpired (tokeninfo), and
  2) its audience (aud) equals OUR client id, so a token minted for another
     app cannot be replayed here.
The client id is optional: when GOOGLE_CLIENT_ID is unset we skip the aud check
(useful for local/dev where the button is hidden anyway).
"""
from __future__ import annotations

import httpx
import time
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlmodel import Session, select

from app.config import get_settings
from app.db import get_session
from app.models import User
from app.auth import create_access_token, create_refresh_token

router = APIRouter(prefix="/api/auth", tags=["auth-google"])

_GOOGLE_TOKENINFO = "https://oauth2.googleapis.com/tokeninfo"


class GoogleLoginIn(BaseModel):
    id_token: str


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


class TokenOut(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserOut


def _verify_google_id_token(id_token: str, expected_aud: str | None) -> dict:
    """Validate a Google ID token via tokeninfo and return its payload.

    Raises HTTPException(401) on any failure. Network errors are surfaced as a
    502 so the caller knows it is an upstream problem, not a bad token.
    """
    try:
        resp = httpx.get(_GOOGLE_TOKENINFO, params={"id_token": id_token},
                         timeout=10.0)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY,
                            detail=f"Could not reach Google token verifier: {exc}")
    if resp.status_code != 200:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="Invalid Google token")
    payload = resp.json()
    # tokeninfo already validated signature+expiry server-side; sanity-check exp.
    if int(payload.get("exp", 0)) < time.time():
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="Google token expired")
    if expected_aud and payload.get("aud") != expected_aud:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="Google token audience does not match this app")
    return payload


@router.post("/google", response_model=TokenOut)
def google_login(body: GoogleLoginIn,
                 session: Session = Depends(get_session)) -> TokenOut:
    settings = get_settings()
    payload = _verify_google_id_token(body.id_token, settings.google_client_id or None)

    email = (payload.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="Google token contained no email")
    if not payload.get("email_verified", False):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="Google email is not verified")

    # Find-or-create, keyed on the verified email (primary key, lowercased).
    user = session.exec(select(User).where(User.email == email)).first()
    is_super = bool(settings.super_admin_email
                    and email == settings.super_admin_email.lower())

    if user is None:
        user = User(
            email=email,
            display_name=(payload.get("name") or email.split("@")[0])[:120],
            is_admin=is_super,        # super admin is granted on first seen
            is_active=True,
        )
        session.add(user)
        session.commit()
        session.refresh(user)
        from app.services import events
        events.emit("info", "auth",
                    f"Google sign-in created account for {email}"
                    + (" (super admin)" if is_super else ""))
    else:
        changed = False
        # Keep profile picture/name fresh; never downgrade a super admin.
        if is_super and not user.is_admin:
            user.is_admin = True
            changed = True
        if not user.display_name and payload.get("name"):
            user.display_name = payload.get("name")[:120]
            changed = True
        if changed:
            session.add(user)
            session.commit()
            session.refresh(user)

    access = create_access_token(user)
    refresh = create_refresh_token(session, user)
    return TokenOut(access_token=access, refresh_token=refresh,
                    user=UserOut.from_user(user))
