# Contributing to RealmForge

Thank you for your interest in contributing to RealmForge! 🏰

## Getting Started

1. **Fork** the repository
2. **Clone** your fork: `git clone https://github.com/YOUR_USERNAME/realmforge.git`
3. **Create a branch**: `git checkout -b feature/my-feature`
4. **Make your changes** and commit
5. **Push** to your fork and open a **Pull Request**

## Development Setup

### Prerequisites
- **Node.js** 18+ (client)
- **Rust** 1.75+ (server)

### Running Locally
```bash
# Terminal 1 — Server
cd server
cargo run --release

# Terminal 2 — Client
cd client
npm install
npm run dev
```

Open http://localhost:3000 in your browser.

### Building
```bash
# Build everything
make build

# Or individually
make build-server
make build-client
```

## Project Structure

```
realmforge/
├── client/          # Phaser 3 + TypeScript + Preact UI
│   ├── src/
│   │   ├── scenes/      # Phaser scenes (Boot, Login, Game)
│   │   ├── ui-html/     # Preact HTML overlay (HUD, panels)
│   │   ├── theme/       # Isometric assets & color palette
│   │   ├── network/     # WebSocket client
│   │   ├── store/       # Preact Signals state management
│   │   └── utils/       # Isometric math, constants
│   └── public/assets/   # Kenney CC0 spritesheets
├── server/          # Rust game server
│   └── src/
│       ├── main.rs      # Game loop, WebSocket, all systems
│       ├── world.rs     # Procedural world generation
│       ├── enemy.rs     # Enemy AI & spawning
│       └── protocol.rs  # Network message types
├── shared/          # Shared constants (balance.json)
└── tools/           # Admin panel, load tester (planned)
```

## Code Guidelines

### Client (TypeScript)
- Use TypeScript strict mode
- Follow existing code style (no specific formatter enforced yet)
- UI components use Preact with Tailwind CSS
- Game rendering uses Phaser 3 API
- State management via `@preact/signals`

### Server (Rust)
- Use `cargo fmt` before committing
- Use `cargo clippy` to catch common issues
- Server is single-binary, no external DB required for development

## What to Contribute

### Good First Issues
- UI improvements and responsive fixes
- New terrain biome details
- Additional Kenney spritesheet frame mappings
- Bug fixes and error handling improvements

### Feature Ideas
- New quest types
- Additional crafting recipes
- New enemy behaviors
- Sound effects and music integration
- Mobile touch controls

### Assets
All game assets must be **CC0 / Public Domain** or **MIT-compatible**. We primarily use [Kenney.nl](https://kenney.nl/) assets. If adding new assets, include attribution in `CREDITS.md`.

## Reporting Bugs

Open an issue with:
1. **Description** of the bug
2. **Steps to reproduce**
3. **Expected vs actual behavior**
4. **Browser/OS** information
5. **Screenshots** if applicable

## Pull Request Guidelines

- Keep PRs focused on a single change
- Include a clear description of what and why
- Update documentation if needed
- Test your changes locally before submitting
- Reference any related issues

## Code of Conduct

Be respectful and constructive. We're building a game together — keep it fun! 🎮
