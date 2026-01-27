ifneq (,$(wildcard .env))
	include .env
endif

build:
	go build -o ./bin/main main.go

test:
	go test -v ./...

migrate-create:
	migrate create -ext sql -dir ./database/migrations $(name)

migrate-up:
	migrate -verbose -path ./database/migrations -database $(POSTGRESQL_URL) up

migrate-down:
	migrate -verbose -path ./database/migrations -database $(POSTGRESQL_URL) down 1

run-dev:
	export ENV=development && make build && ./bin/main

run-production:
	export ENV=production && ./bin/main

format:
	golines -w .