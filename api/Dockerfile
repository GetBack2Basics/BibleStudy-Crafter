FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# BUILD_STAMP is declared AFTER the apt/pip layers on purpose: it changes on
# every build, so declaring it earlier would invalidate the dependency cache
# and force a full ffmpeg reinstall each time.
ARG BUILD_STAMP=dev

COPY . .

# Written to /etc (not /app) because compose bind-mounts ./api over /app in
# dev, which would shadow the baked-in stamp and report 000000000000.
RUN if [ "$BUILD_STAMP" = "dev" ] || [ -z "$BUILD_STAMP" ]; then \
      date -u +%Y%m%d%H%M > /etc/build_stamp; \
    else \
      echo "$BUILD_STAMP" > /etc/build_stamp; \
    fi

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
