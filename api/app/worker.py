"""RQ worker entrypoint."""
import redis
from rq import Queue, Worker

from app.config import get_build_stamp, get_settings
from app.services import events


def main() -> None:
    settings = get_settings()
    conn = redis.from_url(settings.redis_url)
    events.emit("info", "worker", f"Worker started (build {get_build_stamp()})")
    Worker([Queue("assets", connection=conn)], connection=conn).work(with_scheduler=True)


if __name__ == "__main__":
    main()
