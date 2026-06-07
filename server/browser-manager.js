/**

 *

 */

const { exec } = require('child_process');
const { promisify } = require('util');
const http = require('http');

const execAsync = promisify(exec);

const DOCKER_IMAGE   = 'bld-chromium:latest';
const CDP_PORT       = 9223;  // socat proxy port (Chromium binds 9222 internally)
const CDP_MAX_WAIT   = 60000;   // 60s (includes socat startup time)
const CDP_INTERVAL   = 200;    // Poll every 0.2s

let containerId = null;

async function imageExists() {
  try {
    const { stdout } = await execAsync(`docker image inspect ${DOCKER_IMAGE} --format "{{.Id}}"`);
    return !!stdout.trim();
  } catch { return false; }
}

async function buildImage() {
  const root = require('path').join(__dirname, '..');
  console.log('[BrowserManager] Building Docker image...');
  await execAsync(`docker build -t ${DOCKER_IMAGE} "${root}\\docker"`,
    { maxBuffer: 50 * 1024 * 1024 });
  console.log('[BrowserManager] Image built.');
}

async function isDockerRunning() {
  try {
    await execAsync('docker info');
    return true;
  } catch {
    return false;
  }
}

async function startContainer() {
  if (!(await isDockerRunning())) {
    throw new Error('Docker daemon is not running. Please make sure Docker Desktop is started and try again.');
  }

  if (containerId) return containerId;
  if (!(await imageExists())) await buildImage();

  await execAsync('docker rm -f bld-session').catch(() => {});
  console.log('[BrowserManager] Starting Chromium container...');

  const { stdout } = await execAsync(
    `docker run -d --rm -p ${CDP_PORT}:${CDP_PORT} --shm-size=256m --name bld-session ${DOCKER_IMAGE}`
  );
  containerId = stdout.trim();
  console.log(`[BrowserManager] Started: ${containerId.slice(0, 12)}`);
  return containerId;
}

async function stopContainer() {
  if (containerId) {
    console.log(`[BrowserManager] Stopping: ${containerId.slice(0, 12)}`);
    await execAsync(`docker stop ${containerId}`).catch(() => {});
    containerId = null;
    console.log('[BrowserManager] Stopped.');
  } else {
    await execAsync('docker stop bld-session').catch(() => {});
  }
}

async function isRunning() {
  if (!containerId) return false;
  try {
    const { stdout } = await execAsync(`docker inspect -f "{{.State.Running}}" ${containerId}`);
    return stdout.trim() === 'true';
  } catch { return false; }
}

async function waitForCDP() {
  console.log(`[BrowserManager] Waiting for CDP on 127.0.0.1:${CDP_PORT} ...`);
  const t0 = Date.now();

  while (Date.now() - t0 < CDP_MAX_WAIT) {
    if (await probeCDP('127.0.0.1', CDP_PORT)) {
      console.log('[BrowserManager] CDP ready!');
      return true;
    }
    await sleep(CDP_INTERVAL);
  }
  throw new Error(`CDP not ready after ${CDP_MAX_WAIT / 1000}s`);
}

/** Low-level HTTP probe - avoids fetch() connection reuse / TIME_WAIT issues */
function probeCDP(host, port) {
  return new Promise((resolve) => {
    const req = http.get(
      { hostname: host, port, path: '/json/version', timeout: 3000 },
      (res) => {
        let body = '';
        res.on('data', c => { body += c; });
        res.on('end', () => {
          try {
            const j = JSON.parse(body);
            if (j.Browser) {
              console.log(`[BrowserManager] Chromium: ${j.Browser}`);
              resolve(true);
            } else resolve(false);
          } catch { resolve(false); }
        });
      }
    );
    req.on('error',   () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

function getContainerId() { return containerId; }
function getCDPPort()     { return CDP_PORT; }
function getCDPHost()     { return '127.0.0.1'; }

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

module.exports = {
  startContainer, stopContainer, waitForCDP,
  isRunning, getContainerId, getCDPPort, getCDPHost,
};
