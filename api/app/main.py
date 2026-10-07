from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_build_stamp, get_settings
from app.routers import auth, bible, meta, passages, preferences, studies, google_auth, sources, tts, keys, assets

from app.services import events


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Ensure all tables exist (idempotent; also covers a fresh DB after reset).
    from app.db import create_all, ensure_schema, ensure_demo_account
    create_all()
    ensure_schema()
    ensure_demo_account()
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
app.include_router(google_auth.router)
app.include_router(bible.router)
app.include_router(studies.router)
app.include_router(preferences.router)
app.include_router(passages.router)
app.include_router(sources.router)
app.include_router(tts.router)
app.include_router(keys.router)
app.include_router(assets.router)

# Mount static frontend for single-URL deployment
from pathlib import Path
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

_static_dir = Path("/app/static")
if not _static_dir.exists():
    _static_dir = Path(__file__).resolve().parents[2] / "web" / "dist"

if _static_dir.exists() and (_static_dir / "index.html").exists():
    if (_static_dir / "assets").exists():
        app.mount("/assets", StaticFiles(directory=str(_static_dir / "assets")), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        if full_path.startswith("api/") or full_path.startswith("media/"):
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail="Not Found")
        file_path = _static_dir / full_path
        if full_path and file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(_static_dir / "index.html")

