// Crea le icone PNG da icone/icona.svg: node crea-icone.mjs
import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';
const cartella = path.resolve(import.meta.dirname, '../icone');
const svg = fs.readFileSync(path.join(cartella, 'icona.svg'), 'utf8');
const cache = path.join(process.env.HOME, 'Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || (fs.existsSync(cache) ? cache : undefined) });
const page = await browser.newPage();
for (const [nome, lato, maskable] of [['icona-180.png', 180, true], ['icona-192.png', 192], ['icona-512.png', 512], ['icona-maskable-512.png', 512, true]]) {
  await page.setViewportSize({ width: lato, height: lato });
  const interno = maskable ? svg.replace('rx="112"', 'rx="0"').replace('<path', '<g transform="translate(51 51) scale(.8)"><path').replace('</svg>', '</g></svg>') : svg;
  await page.setContent(`<style>*{margin:0}body{background:transparent}svg{width:${lato}px;height:${lato}px;display:block}</style>${interno}`);
  await page.screenshot({ path: path.join(cartella, nome), omitBackground: !maskable });
}
await browser.close();
