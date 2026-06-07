/**
 * session.js

 */

const puppeteer = require('puppeteer-core');

const REMOTE_WIDTH = 1280;
const REMOTE_HEIGHT = 720;

class BrowserSession {
  constructor(cdpHost, cdpPort) {
    this.cdpHost = cdpHost || '127.0.0.1';
    this.cdpPort = cdpPort;
    this.browser = null;
    this.page = null;
    this.cdpSession = null;
    this.isActive = false;
    this.clients = new Set();
    this.frameCount = 0;
    this.viewportWidth = REMOTE_WIDTH;
    this.viewportHeight = REMOTE_HEIGHT;
    this.blockImages = false;
    this.idleTimer = null;
  }

  addClient(ws) {
    this.clients.add(ws);
    ws.on('close', () => {
      this.clients.delete(ws);
      if (this.clients.size === 0) {
        // Reset idle timer when last client leaves
        this.resetIdleTimer();
      }
    });
  }

  async connect() {
    const browserURL = `http://${this.cdpHost}:${this.cdpPort}`;
    console.log(`[Session] Connecting to CDP at ${browserURL}`);

    this.browser = await puppeteer.connect({
      browserURL,
      defaultViewport: { width: this.viewportWidth, height: this.viewportHeight },
    });

    // Multi-tab target event listeners
    this.browser.on('targetcreated', async (t) => {
      if (t.type() === 'page') {
        await this.updateTabList();
      }
    });

    this.browser.on('targetdestroyed', async (t) => {
      if (t.type() === 'page') {
        setTimeout(async () => {
          try {
            if (!this.browser) return;
            const pages = await this.browser.pages();
            if (pages.length === 0) {
              await this.newTab();
            } else {
              // Verify if active page was closed
              const activeStillOpen = pages.some(p => !p.isClosed() && p.target()._targetId === this.page?.target()._targetId);
              if (!activeStillOpen) {
                await this.switchTab(pages[pages.length - 1].target()._targetId);
              } else {
                await this.updateTabList();
              }
            }
          } catch (err) {
            console.error('[Session] Target destroyed handler error:', err.message);
          }
        }, 100);
      }
    });

    this.browser.on('targetchanged', async (t) => {
      if (t.type() === 'page') {
        await this.updateTabList();
      }
    });

    const pages = await this.browser.pages();
    this.page = pages[0] || (await this.browser.newPage());
    await this.page.setViewport({ width: this.viewportWidth, height: this.viewportHeight });

    this.cdpSession = await this.page.createCDPSession();

    // Track URL changes from navigation
    this.cdpSession.on('Page.frameNavigated', (params) => {
      if (!params.frame.parentId) {
        this.broadcast({ type: 'url-changed', url: params.frame.url });
      }
    });

    this.page.on('load', async () => {
      try {
        const title = await this.page.title();
        const url = this.page.url();
        this.broadcast({ type: 'url-changed', url, title });
      } catch {}
    });

    await this.setupPageHelper(this.page);
    this.setupConsoleLogging();

    await this.startScreencast();
    await this.page.goto('https://www.google.com', { waitUntil: 'domcontentloaded' });
    this.isActive = true;

    await this.updateTabList();
    this.resetIdleTimer();

    console.log('[Session] Connected and streaming.');
  }

  async setupPageHelper(page) {
    try {
      // Expose node function to handle selection copying reactively
      await page.exposeFunction('onRemoteCopy', (text) => {
        this.broadcast({ type: 'clipboard-copy', text });
      }).catch(() => {});

      await page.evaluateOnNewDocument(() => {
        window.addEventListener('copy', () => {
          setTimeout(() => {
            const text = window.getSelection().toString();
            if (text) window.onRemoteCopy(text);
          }, 50);
        });
      }).catch(() => {});
    } catch (err) {
      console.warn('[Session] Setup page helper warning:', err.message);
    }
  }

  setupConsoleLogging() {
    if (!this.page) return;

    this.page.removeAllListeners('console');
    this.page.removeAllListeners('pageerror');

    this.page.on('console', msg => {
      this.broadcast({
        type: 'console-log',
        log: {
          type: msg.type(),
          text: msg.text(),
          location: msg.location()
        }
      });
    });

    this.page.on('pageerror', err => {
      this.broadcast({
        type: 'console-log',
        log: {
          type: 'error',
          text: `Unhandled Exception: ${err.message}`,
          location: { url: this.page.url() }
        }
      });
    });
  }

  async startScreencast() {
    if (!this.cdpSession) return;
    this.cdpSession.on('Page.screencastFrame', async (frame) => {
      this.broadcast({ type: 'frame', data: frame.data });
      this.frameCount++;
      try {
        await this.cdpSession.send('Page.screencastFrameAck', { sessionId: frame.sessionId });
      } catch {}
    });

    await this.cdpSession.send('Page.startScreencast', {
      format: 'jpeg',
      quality: 80,
      maxWidth: this.viewportWidth,
      maxHeight: this.viewportHeight,
      everyNthFrame: 1,
    });
  }

  async updateTabList() {
    if (!this.browser) return;
    try {
      const pages = await this.browser.pages();
      const tabs = [];
      for (const p of pages) {
        if (p.isClosed()) continue;
        try {
          const targetId = p.target()._targetId;
          const url = p.url();
          const title = await p.title();
          tabs.push({
            id: targetId,
            title: title || 'New Tab',
            url: url || 'about:blank',
            isActive: p === this.page,
          });
        } catch {}
      }
      this.broadcast({ type: 'tab-list', tabs });
    } catch (err) {
      console.error('[Session] Error updating tab list:', err.message);
    }
  }

  async switchTab(targetId) {
    if (!this.browser) return;
    try {
      const pages = await this.browser.pages();
      const targetPage = pages.find(p => p.target()._targetId === targetId);
      if (targetPage && targetPage !== this.page) {
        if (this.cdpSession) {
          try { await this.cdpSession.send('Page.stopScreencast'); } catch {}
          this.cdpSession.removeAllListeners('Page.screencastFrame');
          this.cdpSession.removeAllListeners('Page.frameNavigated');
        }

        this.page = targetPage;
        this.cdpSession = await targetPage.createCDPSession();

        this.cdpSession.on('Page.frameNavigated', (params) => {
          if (!params.frame.parentId) {
            this.broadcast({ type: 'url-changed', url: params.frame.url });
          }
        });

        this.page.on('load', async () => {
          try {
            const title = await this.page.title();
            const url = this.page.url();
            this.broadcast({ type: 'url-changed', url, title });
          } catch {}
        });

        await this.setupPageHelper(this.page);
        this.setupConsoleLogging();
        await this.startScreencast();

        if (this.pageScaleFactor) {
          await this.cdpSession.send('Emulation.setPageScaleFactor', { pageScaleFactor: this.pageScaleFactor }).catch(() => {});
        }

        const url = this.page.url();
        const title = await this.page.title();
        this.broadcast({ type: 'url-changed', url, title });

        await this.updateTabList();
      }
    } catch (err) {
      console.error('[Session] Switch tab error:', err.message);
    }
  }

  async closeTab(targetId) {
    if (!this.browser) return;
    try {
      const pages = await this.browser.pages();
      const targetPage = pages.find(p => p.target()._targetId === targetId);
      if (targetPage) {
        await targetPage.close();
      }
    } catch (err) {
      console.error('[Session] Close tab error:', err.message);
    }
  }

  async newTab() {
    if (!this.browser) return;
    try {
      const newPage = await this.browser.newPage();
      await newPage.setViewport({ width: this.viewportWidth, height: this.viewportHeight });
      await this.switchTab(newPage.target()._targetId);
      await newPage.goto('https://www.google.com', { waitUntil: 'domcontentloaded' });
    } catch (err) {
      console.error('[Session] New tab error:', err.message);
    }
  }

  async resize(width, height) {
    if (!this.page || !this.cdpSession) return;
    try {
      this.viewportWidth = width;
      this.viewportHeight = height;
      await this.page.setViewport({ width, height });

      try {
        await this.cdpSession.send('Page.stopScreencast');
      } catch {}

      await this.cdpSession.send('Page.startScreencast', {
        format: 'jpeg',
        quality: 80,
        maxWidth: width,
        maxHeight: height,
        everyNthFrame: 1,
      });

      this.broadcast({ type: 'resized', width, height });
      console.log(`[Session] Viewport dynamically resized: ${width}x${height}`);
    } catch (err) {
      console.error('[Session] Resize error:', err.message);
    }
  }

  async updateSettings(settings) {
    if (!this.page) return;
    try {
      if (settings.blockImages !== undefined) {
        this.blockImages = settings.blockImages;
        await this.page.setRequestInterception(this.blockImages);
        this.page.removeAllListeners('request');
        if (this.blockImages) {
          this.page.on('request', req => {
            if (req.resourceType() === 'image') req.abort();
            else req.continue();
          });
        }
      }

      if (settings.deviceEmulation !== undefined) {
        const devices = {
          desktop: {
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            viewport: { width: REMOTE_WIDTH, height: REMOTE_HEIGHT }
          },
          iphone12: {
            userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0.3 Mobile/15E148 Safari/604.1',
            viewport: { width: 390, height: 844 }
          },
          pixel5: {
            userAgent: 'Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.91 Mobile Safari/537.36',
            viewport: { width: 393, height: 851 }
          }
        };
        const config = devices[settings.deviceEmulation];
        if (config) {
          await this.page.setUserAgent(config.userAgent);
          await this.resize(config.viewport.width, config.viewport.height);
        }
      }

      if (settings.networkThrottling !== undefined) {
        const conditions = {
          offline: { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 },
          slow3g:  { offline: false, latency: 400, downloadThroughput: 50 * 1024, uploadThroughput: 50 * 1024 },
          fast3g:  { offline: false, latency: 150, downloadThroughput: 150 * 1024, uploadThroughput: 75 * 1024 },
          none:    { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }
        };
        const cond = conditions[settings.networkThrottling];
        if (cond && this.cdpSession) {
          await this.cdpSession.send('Network.emulateNetworkConditions', cond);
        }
      }

      if (settings.colorScheme !== undefined) {
        await this.page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: settings.colorScheme }]);
      }
    } catch (err) {
      console.error('[Session] Settings update error:', err.message);
    }
  }

  async clearData(options) {
    if (!this.cdpSession) return;
    try {
      if (options.cookies) {
        await this.cdpSession.send('Network.clearBrowserCookies');
      }
      if (options.cache) {
        await this.cdpSession.send('Network.clearBrowserCache');
      }
    } catch (err) {
      console.error('[Session] Clear data error:', err.message);
    }
  }

  async runAutomationScript(scriptId) {
    if (!this.page || !this.isActive) return;

    this.broadcast({
      type: 'console-log',
      log: {
        type: 'info',
        text: `[Automation] Starting script: ${scriptId}`,
        location: { url: this.page.url() }
      }
    });

    try {
      switch (scriptId) {
        case 'wikipedia-crawler': {
          await this.page.goto('https://en.wikipedia.org/wiki/Special:Random', { waitUntil: 'domcontentloaded' });
          const data = await this.page.evaluate(() => {
            const title = document.querySelector('#firstHeading')?.innerText || 'Unknown Title';
            const body = document.querySelector('#mw-content-text');
            const paragraphs = Array.from(body?.querySelectorAll('p') || []);
            let firstPara = '';
            for (const p of paragraphs) {
              const text = p.innerText.trim();
              if (text.length > 50) {
                firstPara = text;
                break;
              }
            }
            if (!firstPara && paragraphs.length > 0) {
              firstPara = paragraphs[0].innerText.trim();
            }
            const linkCount = body?.querySelectorAll('a[href^="/wiki/"]').length || 0;
            return { title, linkCount, firstPara };
          });

          await this.page.evaluate((d) => {
            console.log(`=================================`);
            console.log(`📖 WIKIPEDIA RANDOM PAGE CRAWLER`);
            console.log(`=================================`);
            console.log(`Title: ${d.title}`);
            console.log(`Internal Links Found: ${d.linkCount}`);
            console.log(`First Paragraph Snippet:\n"${d.firstPara.slice(0, 300)}..."`);
            console.log(`=================================`);
          }, data);
          break;
        }

        case 'seo-auditor': {
          let url = this.page.url();
          if (!url || url === 'about:blank') {
            url = 'https://www.google.com';
            await this.page.goto(url, { waitUntil: 'domcontentloaded' });
          }

          const auditData = await this.page.evaluate(() => {
            const t = window.performance.timing;
            const loadTimeMs = t.loadEventEnd > 0 && t.navigationStart > 0 ? (t.loadEventEnd - t.navigationStart) : 'N/A';
            const domReadyMs = t.domComplete > 0 && t.responseStart > 0 ? (t.domComplete - t.responseStart) : 'N/A';

            const metaTags = {};
            document.querySelectorAll('meta').forEach(m => {
              const name = m.getAttribute('name') || m.getAttribute('property');
              const content = m.getAttribute('content');
              if (name && content) {
                metaTags[name] = content;
              }
            });

            const scripts = document.querySelectorAll('script').length;
            const stylesheets = document.querySelectorAll('link[rel="stylesheet"]').length;
            const images = document.querySelectorAll('img').length;
            const title = document.title;
            const h1Count = document.querySelectorAll('h1').length;

            return {
              url: window.location.href,
              title,
              loadTimeMs,
              domReadyMs,
              metaTags,
              assets: { scripts, stylesheets, images },
              h1Count
            };
          });

          await this.page.evaluate((d) => {
            console.log(`=================================`);
            console.log(`⚡ SEO & PERFORMANCE AUDIT REPORT`);
            console.log(`=================================`);
            console.log(`Target URL: ${d.url}`);
            console.log(`Page Title: ${d.title}`);
            console.log(`H1 Tags Count: ${d.h1Count}`);
            console.log(`Load Time: ${d.loadTimeMs}ms`);
            console.log(`DOM Complete Time: ${d.domReadyMs}ms`);
            console.log(`---------------------------------`);
            console.log(`Assets Detected:`);
            console.log(`  - Scripts: ${d.assets.scripts}`);
            console.log(`  - Stylesheets: ${d.assets.stylesheets}`);
            console.log(`  - Images: ${d.assets.images}`);
            console.log(`---------------------------------`);
            console.log(`Meta Tags Checked:`);
            console.log(`  - description: ${d.metaTags.description || 'Missing ⚠️'}`);
            console.log(`  - viewport: ${d.metaTags.viewport || 'Missing ⚠️'}`);
            console.log(`  - og:title: ${d.metaTags['og:title'] || 'Missing ⚠️'}`);
            console.log(`=================================`);
          }, auditData);
          break;
        }

        case 'hn-scraper': {
          await this.page.goto('https://news.ycombinator.com', { waitUntil: 'domcontentloaded' });
          await this.page.waitForSelector('.athing', { timeout: 10000 });
          const items = await this.page.evaluate(() => {
            const list = [];
            const rows = Array.from(document.querySelectorAll('.athing')).slice(0, 5);
            rows.forEach(row => {
              const titleEl = row.querySelector('.titleline > a');
              const subtext = row.nextElementSibling;
              const scoreEl = subtext?.querySelector('.score');
              const hnuserEl = subtext?.querySelector('.hnuser');
              list.push({
                title: titleEl?.innerText || 'No title',
                url: titleEl?.getAttribute('href') || '',
                score: scoreEl?.innerText || '0 points',
                author: hnuserEl?.innerText || 'unknown'
              });
            });
            return list;
          });

          await this.page.evaluate((list) => {
            console.log(`=================================`);
            console.log(`🔥 HACKER NEWS TOP 5 SCRAPER`);
            console.log(`=================================`);
            list.forEach((item, index) => {
              console.log(`${index + 1}. ${item.title}`);
              console.log(`   Score: ${item.score} | Author: ${item.author}`);
              console.log(`   URL: ${item.url}`);
            });
            console.log(`=================================`);
          }, items);
          break;
        }
      }

      this.broadcast({
        type: 'console-log',
        log: {
          type: 'info',
          text: `[Automation] Script completed successfully: ${scriptId}`,
          location: { url: this.page.url() }
        }
      });
    } catch (err) {
      console.error(`[Automation] Error running script ${scriptId}:`, err);
      this.broadcast({
        type: 'console-log',
        log: {
          type: 'error',
          text: `[Automation] Script failed: ${err.message}`,
          location: { url: this.page.url() }
        }
      });
    }
  }

  resetIdleTimer() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    const TIMEOUT_MS = 5 * 60 * 1000; // 5 min idle auto-shutdown
    this.idleTimer = setTimeout(() => {
      console.log('[Session] Inactivity limit reached. Terminating container.');
      this.stopSessionAndContainer();
    }, TIMEOUT_MS);
  }

  async stopSessionAndContainer() {
    this.isActive = false;
    if (this.idleTimer) clearTimeout(this.idleTimer);
    try {
      await this.stop();
      const browserManager = require('./browser-manager');
      await browserManager.stopContainer();
      this.broadcast({ type: 'session-stopped' });
    } catch (err) {
      console.error('[Session] Inactivity stop error:', err.message);
    }
  }

  async handleInput(msg) {
    this.resetIdleTimer();
    if (!this.cdpSession || !this.isActive) return;
    try {
      switch (msg.type) {
        case 'mousemove':
          await this.cdpSession.send('Input.dispatchMouseEvent', {
            type: 'mouseMoved',
            x: clamp(msg.x, 0, this.viewportWidth),
            y: clamp(msg.y, 0, this.viewportHeight),
          });
          break;
        case 'mousedown':
          await this.cdpSession.send('Input.dispatchMouseEvent', {
            type: 'mousePressed',
            x: clamp(msg.x, 0, this.viewportWidth),
            y: clamp(msg.y, 0, this.viewportHeight),
            button: msg.button || 'left',
            buttons: msg.button === 'right' ? 2 : 1,
            clickCount: msg.clickCount || 1,
          });
          break;
        case 'mouseup':
          await this.cdpSession.send('Input.dispatchMouseEvent', {
            type: 'mouseReleased',
            x: clamp(msg.x, 0, this.viewportWidth),
            y: clamp(msg.y, 0, this.viewportHeight),
            button: msg.button || 'left',
            buttons: 0,
            clickCount: msg.clickCount || 1,
          });
          break;
        case 'scroll':
          await this.cdpSession.send('Input.dispatchMouseEvent', {
            type: 'mouseWheel',
            x: clamp(msg.x, 0, this.viewportWidth),
            y: clamp(msg.y, 0, this.viewportHeight),
            deltaX: msg.deltaX || 0,
            deltaY: msg.deltaY || 0,
          });
          break;
        case 'keydown': {
          const modifiers = msg.modifiers || 0;
          await this.cdpSession.send('Input.dispatchKeyEvent', {
            type: 'rawKeyDown',
            key: msg.key,
            code: msg.code,
            windowsVirtualKeyCode: msg.keyCode || 0,
            nativeVirtualKeyCode: msg.keyCode || 0,
            modifiers,
          });
          if (msg.key && msg.key.length === 1) {
            await this.cdpSession.send('Input.dispatchKeyEvent', {
              type: 'char',
              key: msg.key,
              text: msg.key,
              unmodifiedText: msg.key,
              windowsVirtualKeyCode: msg.keyCode || msg.key.charCodeAt(0),
              modifiers,
            });
          }
          break;
        }
        case 'keyup':
          await this.cdpSession.send('Input.dispatchKeyEvent', {
            type: 'keyUp',
            key: msg.key,
            code: msg.code,
            windowsVirtualKeyCode: msg.keyCode || 0,
            nativeVirtualKeyCode: msg.keyCode || 0,
            modifiers: msg.modifiers || 0,
          });
          break;
        case 'navigate': {
          let url = msg.url.trim();
          if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = url.includes('.') && !url.includes(' ') ? `https://${url}` : `https://www.google.com/search?q=${encodeURIComponent(url)}`;
          }
          await this.page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => {});
          break;
        }
        case 'go-back':    await this.page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => {}); break;
        case 'go-forward': await this.page.goForward({ waitUntil: 'domcontentloaded' }).catch(() => {}); break;
        case 'reload':     await this.page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {}); break;
        case 'new-tab':    await this.newTab(); break;
        case 'switch-tab': await this.switchTab(msg.id); break;
        case 'close-tab':  await this.closeTab(msg.id); break;
        case 'resize':     await this.resize(msg.width, msg.height); break;
        case 'zoom':
          if (this.cdpSession) {
            this.pageScaleFactor = msg.scale;
            await this.cdpSession.send('Emulation.setPageScaleFactor', { pageScaleFactor: msg.scale }).catch(() => {});
          }
          break;
        case 'paste':
          await this.cdpSession.send('Input.insertText', { text: msg.text });
          break;
        case 'update-settings':
          await this.updateSettings(msg.settings);
          break;
        case 'clear-data':
          await this.clearData(msg.options);
          break;
        case 'run-script':
          await this.runAutomationScript(msg.scriptId);
          break;
      }
    } catch (err) {
      // Inputs can fail during navigation transitions, suppress non-fatal warnings
    }
  }

  async getCurrentUrl() {
    try { return this.page?.url() || ''; } catch { return ''; }
  }

  broadcast(data) {
    const payload = JSON.stringify(data);
    for (const client of this.clients) {
      if (client.readyState === 1) client.send(payload, { binary: false });
    }
  }

  async stop() {
    this.isActive = false;
    if (this.idleTimer) clearTimeout(this.idleTimer);
    try { if (this.cdpSession) await this.cdpSession.send('Page.stopScreencast'); } catch {}
    try { if (this.browser) await this.browser.disconnect(); } catch {}
    this.browser = null;
    this.page = null;
    this.cdpSession = null;
    console.log('[Session] Stopped.');
  }
}

function clamp(val, min, max) { return Math.max(min, Math.min(max, val)); }

module.exports = BrowserSession;
