SHELL := /bin/bash
export BUILD_STAMP := $(shell date -u +%Y%m%d%H%M)

# Ports come from .env; see .env.example. `ports` re-checks them before starting.
WEB_PORT ?= $(shell grep -E '^WEB_PORT=' .env 2>/dev/null | cut -d= -f2)
WEB_PORT := $(if $(WEB_PORT),$(WEB_PORT),8420)
API_PORT ?= $(shell grep -E '^API_PORT=' .env 2>/dev/null | cut -d= -f2)
API_PORT := $(if $(API_PORT),$(API_PORT),8421)

.PHONY: up down build logs test seed ps stamp restart ports

## Fail fast if any configured port is already taken by another process
ports:
	@python scripts/check_ports.py

## Build + start everything, stamping images with the current yyyymmddhhmm
up: ports
	@echo "BUILD_STAMP=$(BUILD_STAMP)"
	docker compose up -d --build
	@echo ""
	@echo "  web -> http://localhost:$(WEB_PORT)"
	@echo "  api -> http://localhost:$(API_PORT)/docs"

## Rebuild images without starting
build:
	docker compose build

## Stop everything
down:
	docker compose down

## Restart app services only (keeps db/redis data)
restart:
	docker compose restart api worker web

## Follow logs
logs:
	docker compose logs -f --tail=80

## Run the test suite
test:
	docker compose run --rm --no-deps api pytest -v

## Download + load Bible translations (resume-safe; --only KJV for one)
seed:
	docker compose --profile seed run --rm seeder $(ARGS)

## Container status
ps:
	docker compose ps

## Show the build stamp the running api reports
stamp:
	@curl -s http://localhost:$(API_PORT)/api/meta | python -c "import sys,json;print(json.load(sys.stdin)['build_stamp'])"
