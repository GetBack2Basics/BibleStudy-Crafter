from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_build_stamp, get_settings
from app.routers import bible, meta
from app.services import events


@asynccontextmanager
async def lifespan(app: FastAPI):
    events.emit("info", "api", f"API started (build {get_build_stamp()})")
    yield


app = FastAPI(title="BibleStudy-Crafter API", version="0.1.0", lifespan=lifespan)

# CORS origins are derived from WEB_PORT rather than hard-coded: when the port
# moves (collision), the allow-list must move with it or the browser silently
# blocks every call and the UI shows a disconnected API.
_web_port = get_settings().web_port
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        f"http://localhost:{_web_port}",
        f"http://127.0.0.1:{_web_port}",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(meta.router)
app.include_router(bible.router)
