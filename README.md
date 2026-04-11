<div align="center">

# 🏰 RealmForge

**Browser-based 2D isometric MMORPG** with procedural world generation,
infinite level progression, and Habbo Hotel-inspired pixel art aesthetic.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Rust](https://img.shields.io/badge/Server-Rust-orange.svg)](https://www.rust-lang.org/)
[![TypeScript](https://img.shields.io/badge/Client-TypeScript-blue.svg)](https://www.typescriptlang.org/)
[![Phaser 3](https://img.shields.io/badge/Engine-Phaser%203-blueviolet.svg)](https://phaser.io/)

[Getting Started](#-quick-start) · [Features](#-features) · [Architecture](#-architecture) · [Contributing](#-contributing)

</div>

---

## 🎮 About

RealmForge is a fully open-source MMORPG that runs entirely in the browser. Explore procedurally generated isometric worlds, fight enemies, level up, craft items, trade with other players, and join guilds — all with zero downloads required.

**Tech Stack:**
| Layer | Technology |
|---|---|
| **Client** | Phaser 3 + TypeScript + Preact + Tailwind CSS (Vite) |
| **Server** | Rust (tokio + axum + dashmap) |
| **Protocol** | JSON over WebSocket |
| **Assets** | [Kenney.nl](https://kenney.nl/) CC0 spritesheets + procedural generation |

## 🚀 Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://www.rust-lang.org/tools/install) 1.75+

### Run with Make

```bash
# Install client dependencies
make install

# Start both server & client
make dev
```

### Run Manually

```bash
# Terminal 1 — Server (port 8080)
cd server
cargo run --release

# Terminal 2 — Client (port 3000)
cd client
npm install
npm run dev
```

Open **http://localhost:3000** — register an account and start playing!

### Production Build

```bash
make build
# Server binary: server/target/release/realmforge-server
# Client bundle: client/dist/
```

## ✨ Features

### World & Rendering
- 🗺️ Procedural infinite world generation (Perlin noise biomes)
- 🎨 Isometric 2D rendering with 3D depth edges
- 🌊 Animated water tiles with phase-offset shimmer
- 🌲 8 terrain biomes: grass, water, sand, stone, snow, forest, swamp, town
- 🏘️ Town safe zone with NPCs, shops, and services
- 🌙 Day/night cycle with dynamic lighting
- ⛅ Weather system (rain, snow, fog, storms)

### Gameplay
- ⚔️ Real-time combat with auto-attack and skill hotbar (6 slots)
- 🎯 Click-to-move & WASD movement (server-authoritative)
- 📈 Infinite level progression with exponential XP scaling
- 🛡️ 4 character classes with unique skill trees
- 👹 Procedural enemy ranks (Normal, Champion, Elite, Boss)
- ⚰️ PvP with loot drop risk

### Systems
- 🎒 Full inventory & equipment system
- 🏦 Bank storage
- ⚒️ Crafting system with recipes
- 🛒 Player marketplace
- 📜 Quest system (15+ quests)
- 🏆 Achievements & leaderboards
- ⚗️ Enchanting & item upgrades
- 🐾 Pet companions
- 🎣 Fishing minigame
- ⛏️ Mining profession
- 🏰 Guild system with ranks
- 📧 Mail system
- ⚔️ Arena PvP
- 🗡️ Dungeon finder
- 📖 Bestiary & faction reputation

### UI & Social
- 💬 Multi-channel chat (global, local, whisper, trade)
- 👥 Party system with invites
- 😀 Emote wheel
- 🗣️ NPC dialogue system
- 🔔 Toast notifications
- 📊 Combat log

## 🏗️ Architecture

```
┌─────────────────┐         WebSocket         ┌──────────────────────┐
│  Browser Client  │ ◄══════════════════════► │    Rust Server        │
│  (Phaser 3 +     │    JSON messages          │    (tokio + axum)     │
│   Preact UI)     │                           │                      │
├─────────────────┤                           ├──────────────────────┤
│ • Isometric      │                           │ • Game Loop (20 tps) │
│   Renderer       │                           │ • World Generator    │
│ • Preact HUD     │                           │   (Perlin noise)     │
│ • Input System   │                           │ • Enemy AI (FSM)     │
│ • Chunk Manager  │                           │ • Combat System      │
│ • Audio System   │                           │ • Loot & Economy     │
│ • Signal Store   │                           │ • AOI Broadcaster    │
└─────────────────┘                           │ • Auth & Sessions    │
                                               └──────────────────────┘
```

### Project Structure

```
realmforge/
├── client/                # Browser client
│   ├── src/
│   │   ├── scenes/        # Phaser scenes (Boot, Login, Game)
│   │   │   └── game/      # Game subsystems (chunks, entities, items)
│   │   ├── ui-html/       # Preact overlay UI
│   │   │   ├── hud/       # Always-visible HUD (stats, hotbar, chat)
│   │   │   ├── panels/    # Toggle panels (inventory, crafting, etc.)
│   │   │   ├── overlays/  # Full-screen overlays (death, weather)
│   │   │   └── components/# Reusable UI components
│   │   ├── theme/         # Asset generation & color palette
│   │   ├── network/       # WebSocket client
│   │   ├── store/         # Preact Signals state management
│   │   ├── services/      # Input gating, audio
│   │   └── utils/         # Isometric math, constants
│   └── public/assets/     # Kenney CC0 spritesheets
├── server/                # Rust game server
│   └── src/
│       ├── main.rs        # Game loop, WebSocket, all systems
│       ├── world.rs       # Procedural world generation (Perlin)
│       ├── enemy.rs       # Enemy AI, spawning, ranks
│       └── protocol.rs    # Network message definitions
├── shared/                # Shared constants
│   └── constants/
│       └── balance.json   # Game balance parameters
├── tools/                 # Utilities (planned)
├── Makefile               # Build & run commands
├── LICENSE                # MIT License
├── CONTRIBUTING.md        # Contribution guidelines
└── CREDITS.md             # Asset attributions
```

## 🤝 Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

```bash
# Fork → Clone → Branch → Code → PR
git clone https://github.com/YOUR_USERNAME/realmforge.git
cd realmforge
git checkout -b feature/my-feature
```

## 📜 License

This project is licensed under the [MIT License](LICENSE).

Game assets from [Kenney.nl](https://kenney.nl/) are [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) (Public Domain).
See [CREDITS.md](CREDITS.md) for full attributions.

## 🙏 Acknowledgments

- [Kenney](https://kenney.nl/) for the amazing CC0 game assets
- [Phaser](https://phaser.io/) for the game framework
- [Preact](https://preactjs.com/) for the lightweight UI layer
- The Rust community for the incredible async ecosystem
