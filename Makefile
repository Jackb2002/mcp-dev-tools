.PHONY: help install build dev dev-core dev-mcp test lint clean

help:
	@echo "Dev Tools MCP - Makefile Commands"
	@echo ""
	@echo "Setup & Build:"
	@echo "  make install      - Install dependencies"
	@echo "  make build        - Build all workspaces"
	@echo ""
	@echo "Development:"
	@echo "  make dev          - Start MCP server"
	@echo "  make dev-core     - Watch & rebuild core library"
	@echo "  make dev-mcp      - Watch & rebuild MCP server"
	@echo ""
	@echo "Testing & Quality:"
	@echo "  make test         - Run tests"
	@echo "  make lint         - Run linter"
	@echo ""
	@echo "Maintenance:"
	@echo "  make clean        - Remove build artifacts"
	@echo ""

install:
	npm install

build:
	npm run build

dev:
	npm start -w mcp-server

dev-core:
	npm run dev -w core

dev-mcp:
	npm run dev -w mcp-server

test:
	npm run test -w core

lint:
	npm run lint

clean:
	rm -rf core/dist
	rm -rf mcp-server/dist
	rm -rf vs-extension/dist
	rm -rf node_modules
	find . -name ".dev-tools" -type d -exec rm -rf {} \; 2>/dev/null || true
