# Nexus - Remote Browser Control

A real-time remote browser control system that spins up an isolated Chromium instance inside Docker and streams it to your browser via CDP (Chrome DevTools Protocol) and WebSocket.

![Architecture](https://img.shields.io/badge/Architecture-Docker%20%2B%20CDP%20%2B%20WebSocket-blue?style=flat-square)
![Stack](https://img.shields.io/badge/Stack-Next.js%20%2B%20Express%20%2B%20Puppeteer-green?style=flat-square)

---

## How It Works

```
┌──────────────────────────────────────────────────────────┐
│  Your Browser (localhost:3000)                           │
│  ┌────────────────────────────────────────────────────┐  │
│  │  Canvas renders JPEG frames at ~10-15 FPS          │  │
│  │  Mouse/Keyboard events → JSON → WebSocket          │  │
│  └────────────────────────────────────────────────────┘  │
└───────────────────────┬──────────────────────────────────┘
                        │ WebSocket
                        ▼
┌──────────────────────────────────────────────────────────┐
│  Node.js Server (localhost:4000)                         │
│                                                          │
│  Express REST API:                                       │
│    POST /api/start     → Spins up Docker container       │
│    POST /api/stop      → Tears down container            │
│    GET  /api/status    → Container health                │
│    GET  /api/screenshot → PNG snapshot                   │
│                                                          │
│  WebSocket Bridge:                                       │
│    Screencast frames (CDP → Client)                      │
│    Input events (Client → CDP)                           │
└───────────────────────┬──────────────────────────────────┘
                        │ CDP over HTTP
                        ▼
┌──────────────────────────────────────────────────────────┐
│  Docker Container (bld-chromium:latest)                   │
│                                                          │
│  Chromium (--headless=new)                                │
│    └── Binds CDP to 127.0.0.1:9222 (internal)           │
│                                                          │
│  socat proxy                                             │
│    └── 0.0.0.0:9223 → 127.0.0.1:9222                   │
│    └── Makes CDP accessible from Docker host             │
│                                                          │
│  Port mapping: host:9223 → container:9223                │
└──────────────────────────────────────────────────────────┘
```

## Key Engineering Decision: The socat Proxy

Chromium's `--headless=new` mode has a known upstream behavior: it ignores `--remote-debugging-address=0.0.0.0` and always binds CDP to `127.0.0.1:9222` inside the container. This breaks Docker's port mapping on Windows/Mac because the port is only listening on loopback inside the container.

This is documented in `docker/start.sh` with the exact reasoning.

---

## Quick Start

### Prerequisites
- **Docker Desktop** (running)
- **Node.js** ≥ 18

### Setup

```bash
# Clone and install
cd browser-control
npm install && npm install --prefix server && npm install --prefix client

# Build the Docker image (~3 min first time, cached after)
docker build -t bld-chromium:latest ./docker
```

### Run

```bash
# Terminal 1 - Backend
cd server && node index.js

# Terminal 2 - Frontend
cd client && npx next dev -p 3000
```

Open **http://localhost:3000** and click **Launch Browser**.

---

## Project Structure

```
browser-control/
├── docker/
│   ├── Dockerfile          # Chromium + socat + curl + dos2unix
│   └── start.sh            # Container entrypoint: Chromium → CDP probe → socat
│
├── server/
│   ├── index.js            # Express + WebSocket server
│   ├── browser-manager.js  # Docker container lifecycle + CDP health probing
│   └── session.js          # Puppeteer CDP session: screencast + input dispatch
│
├── client/
│   ├── app/
│   │   ├── layout.js       # Next.js root layout with Inter font
│   │   ├── page.js         # Main UI: session state machine + WebSocket client
│   │   └── globals.css     # Design system: tokens, components, animations
│   ├── components/
│   │   ├── BrowserViewer.jsx  # Canvas viewport with coordinate scaling
│   │   ├── Toolbar.jsx       # URL bar + navigation (SVG icons)
│   │   └── StatusBar.jsx     # VS Code-style segmented status bar
│   └── next.config.js      # API proxy rewrite rules
│
├── package.json            # Root workspace
└── README.md
```

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | Next.js 14 + React | UI framework with SSR support |
| Styling | Vanilla CSS | Custom design system, no framework dependency |
| Backend | Express.js | REST API + HTTP server |
| Real-time | WebSocket (ws) | Bidirectional frame/input streaming |
| Browser | Puppeteer-core | CDP client for screencast + input dispatch |
| Container | Docker + Debian | Isolated Chromium environment |
| Proxy | socat | CDP port forwarding inside container |

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/start` | Start a new browser session (spins up Docker) |
| `POST` | `/api/stop` | Stop active session (tears down container) |
| `GET` | `/api/status` | Container status + health info |
| `GET` | `/api/screenshot` | PNG screenshot (base64 encoded) |
| `WS` | `/ws` | WebSocket: frames + input events |

## License

MIT
