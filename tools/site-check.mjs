#!/usr/bin/env node
/*
 * site-check.mjs: proves the organisation site behaves as planned, before any push.
 * The site is served locally the way GitHub Pages serves it (index.html for a folder,
 * 404.html with status 404 for a missing path). Headless only.
 * The two outside hosts are answered by stubs: nothing leaves the machine.
 *
 *   node tools/site-check.mjs
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, dirname, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GLOBAL = execSync('npm root -g', { encoding: 'utf8' }).trim();
const { chromium } = createRequire(join(GLOBAL, 'x.js'))('playwright');
const PORT = Number(process.env.SITE_PORT || 8931), SITE = `http://localhost:${PORT}`;
const OLAM = 'https://olam-creations.com', ULPAN = 'https://ulpan-hebrew.pages.dev';

const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png' };

const server = createServer(async (req, res) => {
  const u = new URL(req.url, SITE);
  const send = (s, h, b) => { res.writeHead(s, { 'cache-control': 'no-store', ...h }); res.end(b); };
  const rel = normalize(decodeURIComponent(u.pathname)).replace(/^(\.\.[/\\])+/, '');
  let f = join(ROOT, rel);
  try {
    let st = await stat(f);
    if (st.isDirectory()) {
      if (!u.pathname.endsWith('/')) return send(301, { location: u.pathname + '/' + u.search }, '');
      f = join(f, 'index.html'); st = await stat(f);
    }
    return send(200, { 'content-type': TYPES[extname(f)] || 'application/octet-stream' }, await readFile(f));
  } catch {
    return send(404, { 'content-type': 'text/html; charset=utf-8' }, await readFile(join(ROOT, '404.html')));
  }
}).listen(PORT);

const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || undefined });
async function newPage(ctx) {
  const p = await ctx.newPage();
  await p.route(`${OLAM}/**`, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<title>olam stub</title>' }));
  await p.route(`${ULPAN}/**`, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<title>ulpan stub</title>' }));
  return p;
}
const dest = (p, o) => p.waitForURL((u) => u.origin === o, { timeout: 15000 }).catch(() => {});

try {
  /* 1. root */
  let ctx = await browser.newContext(); let p = await newPage(ctx);
  await p.goto(`${SITE}/`, { waitUntil: 'domcontentloaded' }); await dest(p, OLAM);
  check('1 the root redirects to olam-creations.com', p.url() === `${OLAM}/`, p.url());
  const html = await readFile(join(ROOT, 'index.html'), 'utf8');
  check('1b root has meta refresh, canonical and a visible link',
    /<meta http-equiv="refresh" content="0; url=https:\/\/olam-creations\.com\/">/.test(html)
    && /<link rel="canonical" href="https:\/\/olam-creations\.com\/">/.test(html)
    && /<a href="https:\/\/olam-creations\.com\/">/.test(html));
  await ctx.close();

  /* 2. deep legacy link, with the learning data seeded on the shared origin */
  ctx = await browser.newContext(); p = await newPage(ctx);
  await p.goto(`${SITE}/ulpan-hebrew/manifest.json`, { waitUntil: 'domcontentloaded' });
  const seed = { 'hebrew-sr': '{"a":1}', theme: 'dark' };
  await p.evaluate((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed);
  const resp = await p.goto(`${SITE}/ulpan-hebrew/lessons/05-numbers.html?x=1`, { waitUntil: 'domcontentloaded' });
  check('2a the deep link is a 404 on the host (so 404.html answers)', resp.status() === 404, String(resp.status()));
  await dest(p, ULPAN);
  const u = new URL(p.url());
  check('2b it arrives on the migration entry of ulpan-hebrew.pages.dev with the same page',
    u.origin === ULPAN && u.pathname === '/migrate' && u.searchParams.get('to') === '/lessons/05-numbers.html?x=1', p.url().replace(/#.*/, '#...'));
  const data = JSON.parse(Buffer.from(u.hash.slice(3), 'base64url').toString('utf8'));
  check('2c the learning data travels in the fragment', data['hebrew-sr'] === seed['hebrew-sr'] && data.theme === 'dark');
  await ctx.close();

  /* 3. folder home and flat legacy link */
  ctx = await browser.newContext(); p = await newPage(ctx);
  await p.goto(`${SITE}/ulpan-hebrew/`, { waitUntil: 'domcontentloaded' }); await dest(p, ULPAN);
  check('3a /ulpan-hebrew/ maps to the new home', new URL(p.url()).searchParams.get('to') === '/', p.url());
  await p.goto(`${SITE}/ulpan-hebrew`, { waitUntil: 'domcontentloaded' }); await dest(p, ULPAN);
  check('3b /ulpan-hebrew (no slash) maps to the new home', new URL(p.url()).searchParams.get('to') === '/', p.url());
  await p.goto(`${SITE}/ulpan-hebrew/12-verbs-past.html`, { waitUntil: 'domcontentloaded' }); await dest(p, ULPAN);
  check('3c a flat legacy link keeps its name', new URL(p.url()).searchParams.get('to') === '/12-verbs-past.html', p.url());
  await ctx.close();

  /* 4. unknown path */
  ctx = await browser.newContext(); p = await newPage(ctx);
  await p.goto(`${SITE}/nothing/here.html`, { waitUntil: 'domcontentloaded' }); await dest(p, OLAM);
  check('4 any other unknown path goes to olam-creations.com', p.url() === `${OLAM}/`, p.url());
  await ctx.close();

  /* 5. an installed copy: the worker alone answers a navigation */
  ctx = await browser.newContext(); p = await newPage(ctx);
  await p.goto(`${SITE}/ulpan-hebrew/manifest.json`, { waitUntil: 'domcontentloaded' });
  await p.evaluate(() => navigator.serviceWorker.register('/ulpan-hebrew/sw.js', { scope: '/ulpan-hebrew/' }));
  await p.waitForFunction(async () => !!(await navigator.serviceWorker.ready).active, null, { timeout: 30000 });
  await p.evaluate(() => localStorage.setItem('hebrew-streak', '7'));
  await p.goto(`${SITE}/ulpan-hebrew/liturgy/songs-001-hatikvah-en.html`, { waitUntil: 'commit' }).catch(() => {});
  await dest(p, ULPAN);
  const u5 = new URL(p.url());
  const d5 = u5.hash.startsWith('#d=') ? JSON.parse(Buffer.from(u5.hash.slice(3), 'base64url').toString('utf8')) : {};
  check('5 an installed copy (worker active) reaches the migration with its data',
    u5.origin === ULPAN && u5.searchParams.get('to') === '/liturgy/songs-001-hatikvah-en.html' && d5['hebrew-streak'] === '7', p.url().replace(/#.*/, '#...'));
  await ctx.close();
} catch (e) {
  check('site test ran to the end', false, String(e.stack || e).split('\n').slice(0, 3).join(' / '));
} finally {
  await browser.close(); server.close();
}
const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
