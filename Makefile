.PHONY: dev server client build clean

# Run both server and client
dev:
	@echo "Starting RealmForge..."
	@make server &
	@sleep 2
	@make client

# Run server
server:
	cd server && cargo run --release

# Run client dev server
client:
	cd client && npx vite

# Build server release
build-server:
	cd server && cargo build --release

# Build client
build-client:
	cd client && npx vite build

# Build both
build: build-server build-client

# Clean
clean:
	cd server && cargo clean
	cd client && rm -rf dist node_modules

# Install client dependencies
install:
	cd client && npm install
