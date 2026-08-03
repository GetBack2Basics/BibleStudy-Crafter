SHELL := /bin/bash
export BUILD_STAMP := $(shell date -u +%Y%m%d%H%M)

.PHONY: up down build logs test seed ps stamp restart

## Build + start everything, stamping the images with the current yyyymmddhhmm
up:
	@echo "BUILD_STAMP=$(BUILD_STAMP)"
	docker compose up -d --build
	@echo "web  -> http://localhost:5173"
	@echo "api  -> http://localhost:8000/api/meta"

build:
	docker compose build

down:
	docker compose down

restart:
	docker compose restart api worker

ps:
	docker compose ps

logs:
	docker compose logs -f --tail=100

## Run the API test suite inside the container
test:
	docker compose run --rm --no-deps api pytest -v

## Download + load public-domain Bibles into Postgres
seed:
	docker compose --profile seed run --rm seeder

## Show the stamp the running api reports
stamp:
	@curl -s http://localhost:8000/api/meta | python -c "import sys,json;print(json.load(sys.stdin)['build_stamp'])"
