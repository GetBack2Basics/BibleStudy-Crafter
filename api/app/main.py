from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_build_stamp, get_settings
from app.routers import auth, bible, meta, passages, preferences, studies

from app.services import events


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Ensure all tables exist (idempotent; also covers a fresh DB after reset).
    from app.db import create_all, ensure_schema
    create_all()
    ensure_schema()
    events.emit("info", "api", f"API started (build {get_build_stamp()})")
    yield


app = FastAPI(title="BibleStudy-Crafter API", version="0.1.0", lifespan=lifespan)

# CORS origins are derived from WEB_PORT rather than hard-coded: when the port
# moves (collision), the allow-list must move with it or the browser silently
# blocks every call and the UI shows a disconnected API.
_web_port = get_settings().web_port
# Allowed CORS origins: explicit list from env, falling back to the local dev
# origin. For an online deployment set CORS_ORIGINS to your frontend hostname(s).
_origins = [o.strip() for o in get_settings().cors_origins.split(",") if o.strip()]
if not _origins:
    _origins = [f"http://localhost:{_web_port}", f"http://127.0.0.1:{_web_port}"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(meta.router)
app.include_router(auth.router)
app.include_router(bible.router)
app.include_router(studies.router)
app.include_router(preferences.router)
app.include_router(passages.router)
