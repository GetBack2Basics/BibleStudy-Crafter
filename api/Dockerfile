FROM python:3.11-slim

ARG BUILD_STAMP=dev
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Build stamp: use the arg when supplied, else fall back to build time.
# NOTE: written OUTSIDE /app because compose bind-mounts ./api over /app in dev,
# which would shadow the baked-in file and leave the stamp reading as unset.
RUN if [ "$BUILD_STAMP" = "dev" ] || [ -z "$BUILD_STAMP" ]; then \
      date -u +%Y%m%d%H%M > /etc/build_stamp; \
    else \
      echo "$BUILD_STAMP" > /etc/build_stamp; \
    fi

COPY . .

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
