from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_build_stamp
from app.routers import meta
from app.services import events


@asynccontextmanager
async def lifespan(app: FastAPI):
    events.emit("info", "api", f"API started (build {get_build_stamp()})")
    yield


app = FastAPI(title="BibleStudy-Crafter API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(meta.router)
