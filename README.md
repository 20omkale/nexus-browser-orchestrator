# Nexus - Remote Browser Orchestration Engine

A low-latency, secure remote browser control and orchestration system. Spawns isolated, sandboxed Chromium instances inside Docker containers and streams them to a responsive web dashboard in real-time over WebSockets.

[![License](https://img.shields.io/github/license/20omkale/nexus-browser-orchestrator?style=for-the-badge&color=blue)](LICENSE)
[![Docker](https://img.shields.io/badge/Docker-Enabled-blue?style=for-the-badge&logo=docker)](https://www.docker.com)
[![Next.js](https://img.shields.io/badge/Next.js-14-black?style=for-the-badge&logo=next.js)](https://nextjs.org)
[![Puppeteer](https://img.shields.io/badge/Puppeteer-Core-green?style=for-the-badge&logo=puppeteer)](https://pptr.dev)

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────┐
│  Next.js Frontend (localhost:3000)                        │
│  ┌────────────────────────────────────────────────────┐  │
│  │  Canvas Viewport (JPEG stream @ 30+ FPS)           │  │
│  │  Client Input Events → JSON Packet → WebSocket     │  │
│  └────────────────────────────────────────────────────┘  │
└───────────────────────┬──────────────────────────────────┘
                        │ WebSocket (ws://localhost:4000/ws)
                        ▼
┌──────────────────────────────────────────────────────────┐
│  Node.js Gateway Server (localhost:4000)                  │
│                                                          │
│  REST API:                                               │
│    POST /api/start     → Provisions Docker container     │
│    POST /api/stop      → Disposes container resources    │
│    GET  /api/status    → Health check & readiness state  │
│    GET  /api/screenshot → Real-time binary snapshot      │
│                                                          │
│  Orchestration Bridge:                                   │
│    Page Screencast Feed (CDP → WebSocket client)         │
│    Event Forwarding (WebSocket client → CDP input)       │
└───────────────────────┬──────────────────────────────────┘
                        │ CDP (Chrome DevTools Protocol)
                        ▼
┌──────────────────────────────────────────────────────────┐
│  Docker Container Sandbox (Debian-Chromium)              │
│                                                          │
│  Headless Chromium                                       │
│    └── Bound to 127.0.0.1:9222 (isolated loopback)       │
│                                                          │
│  socat proxy port-forwarder                              │
│    └── Exposes 0.0.0.0:9223 → 127.0.0.1:9222             │
│                                                          │
│  Port mapping: host:9223 → container:9223                │
└──────────────────────────────────────────────────────────┘
```

---

## Key Engineering Challenges & Solutions

### 1. The Chromium Loopback Binding Issue (`socat` Proxy)
Chromium's `--headless=new` mode enforces binding the Chrome DevTools Protocol (CDP) debugging listener strictly to the container loopback interface (`127.0.0.1:9222`), ignoring traditional bind-address parameters. This prevents Docker port exposure.
*   **Solution**: Inside [docker/start.sh](file:///C:/Users/omkal/Desktop/browser-control/docker/start.sh), we configure a `socat` TCP-LISTEN socket binding to `0.0.0.0:9223` and proxying packets directly to loopback `127.0.0.1:9222`.

### 2. Startup Latency Optimization
Polling container states asynchronously can cause slow loading loops. 
*   **Solution**: The container checking interval was optimized to a `200ms` CDP probe cycle. This cuts launch delay down, transitioning the UI state from "Starting" to "Connected" near-instantly.

### 3. Client-to-Remote Coordinate Mapping
Inputs on the client canvas must map precisely to coordinate values inside the remote viewport, independent of CSS layout scaling or screen resolution.
*   **Solution**: The client canvas listens to event coordinates and normalizes them using the canvas's bounding client rectangle:
    ```javascript
    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * remoteWidth;
    const y = ((event.clientY - rect.top) / rect.height) * remoteHeight;
    ```

---

## Core Features

*   **Low-Latency Viewport Streaming**: Visual stream rendering utilizing optimized Puppeteer Page Screencasts compressed into JPEG binary frames.
*   **Interactive Input Relay**: Capture mouse tracking, single/double clicks, vertical scrolls, keyboard inputs, and text copy-pastes, replaying them with native Chromium drivers.
*   **Mobile Device Emulation**: Support for changing device viewport settings (Desktop, iPhone 12, Pixel 5) and custom media features like light/dark mode triggers.
*   **Network Throttling Profiles**: Network emulation simulating Slow 3G, Fast 3G, Offline, or Uncapped bandwidth states.
*   **Developer Console Interception**: Capture JavaScript warnings, console logs, and errors inside the remote page and render them in a styled drawer.
*   **Secure Stateless Sandboxing**: Containers are ephemeral. Disconnecting automatically terminates and purges the Docker container instance, clearing history and cookies.

---

## Integrated Puppeteer Automation Scripts

The engine supports executing automated Puppeteer crawler operations directly inside the container instance, outputting logs to the UI:

1.  **Wikipedia Random Crawler (`wikipedia-crawler`)**: Navigates to a random article, extracts the main topic title, counts internal wiki links, and extracts the first legible paragraph.
2.  **SEO & Performance Auditor (`seo-auditor`)**: Queries page load performance metrics via the `performance.timing` API, checks critical meta tags (viewport, description, open-graph title), and counts active stylesheet/script assets.
3.  **Hacker News Scraper (`hn-scraper`)**: Loads YC Hacker News, parses the page DOM, and scrapes top 5 article titles, scores, authors, and reference URLs.

---

## Project Structure

```
browser-control/
├── docker/
│   ├── Dockerfile          # Chromium runtime + socat network proxy
│   └── start.sh            # Container boot entrypoint & socket bridge
│
├── server/
│   ├── index.js            # Express API endpoints & WebSocket gateway
│   ├── browser-manager.js  # Docker container spawn & health checks
│   └── session.js          # Puppeteer CDP connection, input mapper & crawler scripts
│
├── client/
│   ├── app/
│   │   ├── layout.js       # Root page template with global font settings
│   │   ├── page.js         # Main workspace dashboard & state-machine
│   │   └── globals.css     # Clean CSS custom styling system & tokens
│   ├── components/
│   │   ├── BrowserViewer.jsx  # HTML5 Canvas rendering engine & input interceptor
│   │   ├── Toolbar.jsx       # Browser address bar & navigation controls
│   │   ├── ConsoleDrawer.jsx # Styled logs panel with level filtering
│   │   ├── StatusBar.jsx     # Footer status bar with system parameters
│   │   └── ControlPanel.jsx  # Side drawer panel for mobile emulation & throttling
│   └── next.config.js      # Next.js API route proxying configuration
│
├── package.json            # Root workspace configurations
└── README.md
```

---

## Getting Started

### Prerequisites
*   [Docker Desktop](https://www.docker.com/products/docker-desktop/) (ensure it is running)
*   [Node.js](https://nodejs.org/) (version ≥ 18)

### Installation
```bash
# Clone the repository
git clone https://github.com/20omkale/nexus-browser-orchestrator.git
cd nexus-browser-orchestrator

# Install dependencies for workspace components
npm install
npm install --prefix server
npm install --prefix client
```

### Building the Sandbox Container
Build the target Chromium sandbox container image:
```bash
docker build -t bld-chromium:latest ./docker
```

### Running the System
```bash
# Start the Backend Gateway (Terminal 1)
cd server && npm run dev

# Start the Frontend Dashboard (Terminal 2)
cd client && npm run dev
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser and click **Launch Browser** to begin!

---

## License
Distributed under the MIT License. See `LICENSE` for more information.
