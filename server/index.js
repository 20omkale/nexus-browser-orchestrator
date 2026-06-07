/**

 */

const express = require('express');
const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');
const cors = require('cors');
const browserManager = require('./browser-manager');
const BrowserSession = require('./session');

const PORT = process.env.PORT || 4000;
const app = express();
const server = http.createServer(app);

app.use(cors({ origin: '*' }));
app.use(express.json());

const wss = new WebSocketServer({ server, path: '/ws' });

let activeSession = null;
let clientIdSeq = 0;

wss.on('connection', (ws, req) => {
  const clientId = ++clientIdSeq;
  ws.id = clientId;
  console.log(`[WS] Client ${clientId} connected`);

  if (activeSession?.isActive) {
    activeSession.addClient(ws);
    ws.send(JSON.stringify({ type: 'session-active' }));
    
    // Send active tab list if session is already running
    activeSession.updateTabList().catch(() => {});
    
    activeSession.getCurrentUrl().then(url => {
      ws.send(JSON.stringify({ type: 'url-changed', url }));
    });
  } else {
    ws.send(JSON.stringify({ type: 'session-idle' }));
  }

  ws.on('message', async (rawData) => {
    try {
      const msg = JSON.parse(rawData.toString());
      
      // Collaborative Cursor Sync: Broadcast client movements to other viewers
      if (msg.type === 'mousemove' && activeSession?.isActive) {
        wss.clients.forEach(client => {
          if (client !== ws && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
              type: 'cursor-update',
              clientId: ws.id,
              x: msg.x,
              y: msg.y
            }));
          }
        });
      }

      if (activeSession?.isActive) {
        await activeSession.handleInput(msg);
      }
    } catch (err) {
      console.error('[WS] Message error:', err.message);
    }
  });

  ws.on('close', () => {
    console.log(`[WS] Client ${clientId} disconnected`);
    // Notify other clients to remove this cursor
    wss.clients.forEach(client => {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({
          type: 'cursor-remove',
          clientId: ws.id
        }));
      }
    });
  });

  ws.on('error', (err) => console.error(`[WS] Client ${clientId} error:`, err.message));
});

function broadcastToAll(data) {
  const payload = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) client.send(payload);
  });
}

app.get('/api/status', async (req, res) => {
  const running = await browserManager.isRunning();
  res.json({
    status: running ? 'running' : 'stopped',
    containerId: browserManager.getContainerId()?.slice(0, 12) || null,
    cdpPort: browserManager.getCDPPort(),
  });
});

app.post('/api/start', async (req, res) => {
  if (activeSession?.isActive) {
    return res.status(409).json({ error: 'Session already active' });
  }

  try {
    broadcastToAll({ type: 'status', message: 'Starting Docker container…' });
    await browserManager.startContainer();

    broadcastToAll({ type: 'status', message: 'Waiting for Chromium to start…' });
    await browserManager.waitForCDP();

    broadcastToAll({ type: 'status', message: 'Connecting to browser…' });
    activeSession = new BrowserSession(browserManager.getCDPHost(), browserManager.getCDPPort());

    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) activeSession.addClient(client);
    });

    await activeSession.connect();

    broadcastToAll({ type: 'session-started' });
    const url = await activeSession.getCurrentUrl();
    broadcastToAll({ type: 'url-changed', url });

    res.json({ success: true, message: 'Session started' });
  } catch (err) {
    console.error('[API] Start error:', err.message);
    broadcastToAll({ type: 'error', message: err.message });
    await browserManager.stopContainer().catch(() => {});
    activeSession = null;
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/stop', async (req, res) => {
  try {
    if (activeSession) { await activeSession.stop(); activeSession = null; }
    await browserManager.stopContainer();
    broadcastToAll({ type: 'session-stopped' });
    res.json({ success: true, message: 'Session stopped' });
  } catch (err) {
    console.error('[API] Stop error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/screenshot', async (req, res) => {
  if (!activeSession?.isActive) return res.status(404).json({ error: 'No active session' });
  try {
    const screenshot = await activeSession.page.screenshot({ type: 'png', encoding: 'base64' });
    res.json({ data: screenshot });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function shutdown() {
  console.log('\n[Server] Shutting down...');
  if (activeSession) await activeSession.stop().catch(() => {});
  await browserManager.stopContainer().catch(() => {});
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

server.listen(PORT, () => {
  console.log(`
  ┌─────────────────────────────────────────┐
  │  Nexus - Remote Browser Control         │
  │                                         │
  │  API : http://localhost:${PORT}             │
  │  WS  : ws://localhost:${PORT}/ws            │
  └─────────────────────────────────────────┘
  `);
});
