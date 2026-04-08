# 🏰 RealmForge

Browser-based 2D isometric MMORPG with procedural world generation, infinite level progression, and Habbo Hotel-inspired pixel art aesthetic.

## Tech Stack

- **Client**: Phaser 3 + TypeScript (Vite)
- **Server**: Rust (tokio + axum + dashmap)
- **Protocol**: JSON over WebSocket (migrating to FlatBuffers)
- **Database**: PostgreSQL + Redis (planned)

## Quick Start

### Prerequisites
- Node.js 18+
- Rust 1.75+

### Run Server
```bash
cd server
cargo run --release
```

### Run Client
```bash
cd client
npm install
npm run dev
```

Then open http://localhost:3000

## Features (MVP)
- [x] Isometric world rendering
- [x] Procedural map generation (Perlin noise biomes)
- [x] WebSocket multiplayer
- [x] Click-to-move with server-authoritative movement
- [x] Player authentication (register/login)
- [x] Procedural enemy spawning with AI
- [x] Combat system with damage formulas
- [x] XP & leveling with exponential scaling
- [x] Diminishing stat returns after level 50
- [x] Area of Interest (AOI) entity broadcasting
- [ ] Inventory & equipment system
- [ ] PvP with loot drop
- [ ] Bank system
- [ ] Marketplace
- [ ] Crafting
- [ ] Chat system

## Architecture
```
Client (Phaser3)  ←→  WebSocket  ←→  Rust Server (tokio)
                                        ├── Game Loop (20 tps)
                                        ├── World Generator (Perlin)
                                        ├── Enemy AI (FSM)
                                        ├── Combat System
                                        └── AOI Broadcaster
```

## License
MIT
