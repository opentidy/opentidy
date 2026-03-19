// Browser bridge — tiny HTTP server controlling a persistent visible Chromium
// Usage: node browser-bridge.mjs <port>
// Each subagent starts one on a unique port (9501-9505)

import { chromium } from '@playwright/test';
import http from 'http';
import { writeFileSync } from 'fs';

const port = parseInt(process.argv[2] || '9501');
const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  const cmd = url.pathname.slice(1);
  res.setHeader('Content-Type', 'application/json');

  try {
    let result;
    switch (cmd) {
      case 'goto':
        await page.goto(url.searchParams.get('url'), { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
        await page.waitForTimeout(500);
        result = { ok: true, url: page.url(), title: await page.title() };
        break;
      case 'text':
        result = { text: await page.evaluate(() => document.body.innerText.substring(0, 5000)) };
        break;
      case 'html':
        result = { html: await page.evaluate(() => document.body.innerHTML.substring(0, 10000)) };
        break;
      case 'screenshot': {
        const path = url.searchParams.get('path') || `/tmp/screenshot-${Date.now()}.png`;
        await page.screenshot({ path, fullPage: url.searchParams.get('full') === 'true' });
        result = { ok: true, path };
        break;
      }
      case 'click':
        await page.click(url.searchParams.get('selector'), { timeout: 5000 });
        await page.waitForTimeout(300);
        result = { ok: true };
        break;
      case 'fill':
        await page.fill(url.searchParams.get('selector'), url.searchParams.get('value'));
        result = { ok: true };
        break;
      case 'type':
        await page.type(url.searchParams.get('selector'), url.searchParams.get('value'), { delay: 30 });
        result = { ok: true };
        break;
      case 'check':
        await page.check(url.searchParams.get('selector'));
        result = { ok: true };
        break;
      case 'uncheck':
        await page.uncheck(url.searchParams.get('selector'));
        result = { ok: true };
        break;
      case 'eval': {
        const body = await new Promise(r => { let d = ''; req.on('data', c => d += c); req.on('end', () => r(d)); });
        result = await page.evaluate(body);
        break;
      }
      case 'wait':
        await page.waitForTimeout(parseInt(url.searchParams.get('ms') || '1000'));
        result = { ok: true };
        break;
      case 'resize':
        await page.setViewportSize({
          width: parseInt(url.searchParams.get('w') || '1280'),
          height: parseInt(url.searchParams.get('h') || '800')
        });
        result = { ok: true };
        break;
      case 'errors':
        result = { errors: [] }; // collected below
        break;
      case 'close':
        await browser.close();
        result = { ok: true };
        setTimeout(() => process.exit(0), 100);
        break;
      default:
        result = { error: `Unknown command: ${cmd}` };
    }
    res.end(JSON.stringify(result));
  } catch (e) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: e.message }));
  }
});

// Collect console errors
const consoleErrors = [];
page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

server.listen(port, () => console.log(`Bridge :${port} ready`));
