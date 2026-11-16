// Regenerates the README pictures in docs/: builds the web app, serves it, and drives
// headless Microsoft Edge (or Chrome) with a fake microphone made of Web Audio
// oscillators, so every state is reproducible without an instrument.
//
//   npm run screenshots              # build + capture
//   npm run screenshots -- --no-build
//   BROWSER_CHANNEL=chrome npm run screenshots
//
// The fake microphone replaces navigator.mediaDevices.getUserMedia in the page:
// window.__tone(hz) plays a string-like tone, window.__strum([...hz], gapMs) plucks
// a sequence, window.__silence() stops, window.__deny = true refuses the mic.

import { execSync } from 'node:child_process';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = resolve(fileURLToPath(import.meta.url), '../..');
const dist = join(root, 'dist');
const out = join(root, 'docs');
const BASE = '/wait-gotta-tune';

if (!process.argv.includes('--no-build')) {
  execSync('npx expo export -p web', { cwd: root, stdio: 'inherit' });
}
if (!existsSync(join(dist, 'index.html'))) throw new Error('dist/ is missing: run without --no-build');

// ---- static server for dist/ under the Pages base path --------------------
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png',
  '.ico': 'image/x-icon', '.json': 'application/json', '.ttf': 'font/ttf', '.svg': 'image/svg+xml' };
const server = createServer((req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path.startsWith(BASE)) path = path.slice(BASE.length);
  let file = join(dist, path);
  if (!file.startsWith(dist) || !existsSync(file) || statSync(file).isDirectory()) file = join(dist, 'index.html');
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}${BASE}/`;

// ---- fake microphone, injected before the app loads -----------------------
function fakeMic() {
  // A hidden tab pauses the tuner; keep the page "visible" while capturing.
  Object.defineProperty(document, 'hidden', { get: () => false });
  Object.defineProperty(document, 'visibilityState', { get: () => 'visible' });
  window.addEventListener('visibilitychange', (e) => e.stopImmediatePropagation(), true);

  const ctx = new AudioContext({ sampleRate: 48000 });
  // The app stops the tracks when it releases the mic, so each request gets a fresh destination.
  const bus = ctx.createGain();
  // Fundamental plus a few weaker overtones, roughly like a plucked string.
  const wave = ctx.createPeriodicWave(new Float32Array([0, 0, 0, 0, 0]), new Float32Array([0, 1, 0.5, 0.25, 0.12]));
  let voices = [];

  const voice = (hz, at, peak, decay) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.setPeriodicWave(wave);
    osc.frequency.value = hz;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(peak, at + 0.005);
    if (decay) gain.gain.exponentialRampToValueAtTime(0.0001, at + decay);
    osc.connect(gain).connect(bus);
    osc.start(at);
    if (decay) osc.stop(at + decay + 0.05);
    voices.push(osc);
  };

  window.__silence = () => {
    voices.forEach((v) => { try { v.stop(); } catch { /* already stopped */ } });
    voices = [];
  };
  window.__tone = (hz) => { window.__silence(); voice(hz, ctx.currentTime, 0.25, 0); };
  window.__strum = (freqs, gapMs) => {
    window.__silence();
    freqs.forEach((hz, i) => voice(hz, ctx.currentTime + 0.05 + (i * gapMs) / 1000, 0.3, 4));
  };
  navigator.mediaDevices.getUserMedia = async () => {
    if (window.__deny) throw new DOMException('Permission denied', 'NotAllowedError');
    await ctx.resume();
    const dest = ctx.createMediaStreamDestination();
    bus.connect(dest);
    return dest.stream;
  };
}

const cents = (hz, c) => hz * 2 ** (c / 1200);
const midiHz = (m) => 440 * 2 ** ((m - 69) / 12);

const browser = await chromium.launch({
  channel: process.env.BROWSER_CHANNEL ?? 'msedge',
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required', '--no-first-run', '--no-default-browser-check'],
});
const context = await browser.newContext({
  viewport: { width: 390, height: 780 },
  deviceScaleFactor: 2,
  colorScheme: 'dark',
});
await context.addInitScript(fakeMic);
let page = await context.newPage();

const shot = async (name, settleMs = 1500) => {
  await page.waitForTimeout(settleMs);
  await page.screenshot({ path: join(out, `${name}.png`) });
  console.log(`docs/${name}.png`);
};
const tab = (name) => page.getByRole('tab', { name }).click();
const string = (n) => page.getByRole('button', { name: new RegExp(`^String ${n},`) }).click();

try {
  await page.goto(url);
  await page.getByText('Tap to start').waitFor();

  // Auto mode
  await shot('auto-idle', 300);
  await page.getByText('Tap to start').click();
  await page.evaluate((hz) => window.__tone(hz), cents(440, -32));
  await shot('auto-flat', 2500);
  await page.evaluate(() => window.__tone(440));
  await shot('auto-in-tune', 2500);

  // Guitar: string 3 (G3) a bit flat -> "tune up" arrow
  await page.evaluate(() => window.__silence());
  await tab('Guitar');
  await shot('guitar-select', 500);
  await string(3);
  await page.evaluate((hz) => window.__tone(hz), cents(midiHz(55), -38));
  await shot('guitar-flat', 2500);
  // ...then in tune: the hold ring fills
  await page.evaluate((hz) => window.__tone(hz), midiHz(55));
  await shot('guitar-in-tune', 1800);

  // Bass: string 2 (D2) sharp -> "tune down" arrow
  await page.evaluate(() => window.__silence());
  await tab('Bass');
  await string(2);
  await page.evaluate((hz) => window.__tone(hz), cents(midiHz(38), 30));
  await shot('bass-sharp', 3000);

  // Ukulele: string 2 (E4) flat
  await page.evaluate(() => window.__silence());
  await tab('Ukulele');
  await string(2);
  await page.evaluate((hz) => window.__tone(hz), cents(midiHz(64), -20));
  await shot('ukulele-flat', 2500);

  // Check all strings: guitar strum from string 6 to 1, B3 23 cents flat, D3 18 sharp
  await page.evaluate(() => window.__silence());
  await tab('Guitar');
  await page.getByRole('button', { name: /Check all strings/ }).click();
  await page.getByText('Pluck string 6').waitFor({ timeout: 10000 });
  await shot('check-start', 300);
  const strum = [40, 45, 50, 55, 59, 64].map(midiHz);
  strum[2] = cents(strum[2], 18);
  strum[4] = cents(strum[4], -23);
  await page.evaluate(([f, gap]) => window.__strum(f, gap), [strum, 600]);
  await page.getByRole('button', { name: 'Enable skipped strings' }).waitFor({ timeout: 15000 });
  await shot('check-result', 500);

  // Microphone refused
  await page.close();
  page = await context.newPage();
  await page.addInitScript(() => { window.__deny = true; });
  await page.goto(url);
  await page.getByText('Tap to start').click();
  await page.getByText('Try again', { exact: true }).waitFor({ timeout: 8000 }).catch(async (error) => {
    console.error(await page.locator('body').innerText());
    throw error;
  });
  await shot('mic-denied', 300);
} finally {
  await browser.close();
  server.close();
}
