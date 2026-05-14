.PHONY: help build run test clean fmt lint docker-build docker-run all

help:
	@echo "Analytics Service — Makefile Commands"
	@echo "======================================"
	@echo "make build         - Build the binary"
	@echo "make run           - Run the service"
	@echo "make test          - Run tests"
	@echo "make fmt           - Format code"
	@echo "make lint          - Run linter"
	@echo "make clean         - Clean build artifacts"
	@echo "make docker-build  - Build Docker image"
	@echo "make docker-run    - Run Docker container"
	@echo "make all           - Build, fmt, lint, test"

build:
	@echo "Building analytics-service..."
	CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o analytics-service .

run:
	@echo "Running analytics-service..."
	go run main.go

test:
	@echo "Running tests..."
	go test -v -cover ./...

fmt:
	@echo "Formatting code..."
	go fmt ./...

lint:
	@echo "Linting code..."
	@which golangci-lint > /dev/null || (echo "Installing golangci-lint..." && go install github.com/golangci-lint/golangci-lint/cmd/golangci-lint@latest)
	golangci-lint run

clean:
	@echo "Cleaning build artifacts..."
	rm -f analytics-service

docker-build:
	@echo "Building Docker image..."
	docker build -t analytics-service:latest .

docker-run:
	@echo "Running Docker container..."
	docker run -p 5003:5003 \
		-e REDIS_URL=redis://redis:6379 \
		-e RABBITMQ_URL=amqp://guest:guest@rabbitmq:5672 \
		analytics-service:latest

all: clean fmt lint build test
	@echo "✓ All tasks completed successfully!"
