// Regenerates docs/poster.png — a 4:3 poster made from real screenshots of the app.
// Usage: pnpm poster   (needs Google Chrome; starts its own dev server on port 5188)
//
// 1. a pixel-art scene is imported into the app and a few strokes are drawn on it;
// 2. three screenshots are taken: the main interface, "Canvas info and colors", "Formats";
// 3. they are laid out on a poster page, which is itself screenshotted.
import { spawn } from 'node:child_process'
import { chromium } from '@playwright/test'

const PORT = 5188
const PAGE_URL = `http://localhost:${PORT}/`
const OUT = new URL('../docs/poster.png', import.meta.url).pathname

// Poster geometry (CSS px). Screenshots are scaled by Z, so all text on the poster has the same size.
const POSTER = { width: 1600, height: 1200, scale: 1.5 } // 1.5 → a 2400×1800 PNG
const Z = 0.88
const MARGIN = 36
const GAP = 28
const HERO_W = 800 // width of the main-interface card on the poster
const RIGHT_W = POSTER.width - 2 * MARGIN - GAP - HERO_W
const APP_PADDING = 20 // .app padding: the app content is narrower than the viewport by 2×this
const viewportFor = (cardWidth) => Math.round(cardWidth / Z) + 2 * APP_PADDING

const server = spawn('pnpm', ['exec', 'vite', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' })
const stop = () => server.kill()
process.on('exit', stop)

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(PAGE_URL)).ok) return
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error('The dev server did not start')
}

/** A 256×144 pixel-art sunset with a small palette and some transparent rows in the water. */
async function sunsetPng(page) {
  const bytes = await page.evaluate(async () => {
    const W = 256
    const H = 144
    const HORIZON = 96
    const c = document.createElement('canvas')
    c.width = W
    c.height = H
    const ctx = c.getContext('2d')
    const px = (x, y, color) => {
      ctx.fillStyle = color
      ctx.fillRect(x, y, 1, 1)
    }
    const sky = ['#1b1f4b', '#2c2a6b', '#4a3a8a', '#7a4a96', '#b9577f', '#e8786a', '#f7a35c', '#fbc873']
    for (let y = 0; y < HORIZON; y++) for (let x = 0; x < W; x++) px(x, y, sky[Math.floor(y / 12)])
    for (let i = 0; i < 40; i++) px((i * 83 + 17) % W, (i * 47 + 5) % 36, '#ffffff') // stars
    // retro sun with stripes
    for (let y = 0; y < HORIZON; y++) {
      if (y > 66 && y % 6 < 2) continue
      for (let x = 0; x < W; x++) if ((x - 128) ** 2 + (y - 68) ** 2 <= 28 * 28) px(x, y, '#ffe08a')
    }
    // two low mountain ranges
    for (let x = 0; x < W; x++) {
      const back = Math.round(HORIZON - (12 + 8 * Math.sin(x / 22) + 5 * Math.sin(x / 9)))
      const front = Math.round(HORIZON - (5 + 5 * Math.sin(x / 15 + 1) + 3 * Math.sin(x / 6)))
      for (let y = back; y < HORIZON; y++) px(x, y, '#3a2f6b')
      for (let y = front; y < HORIZON; y++) px(x, y, '#241c47')
    }
    // water: stripes, a reflection, and empty (transparent) rows in between
    for (let y = HORIZON; y < H; y++) {
      const phase = y % 6
      if (phase >= 4) continue
      for (let x = 0; x < W; x++) {
        const sun = Math.abs(x - 128) < 22 - (y - HORIZON) / 3
        px(x, y, sun && phase < 2 ? '#e8786a' : phase < 2 ? '#2a2250' : '#14122b')
      }
    }
    const blob = await new Promise((res) => c.toBlob((b) => res(b), 'image/png'))
    return [...new Uint8Array(await blob.arrayBuffer())]
  })
  return Buffer.from(bytes)
}

/** Opens the app at a given viewport width, imports the scene and draws a few strokes. */
async function preparedPage(browser, width, height = 3000) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 })
  await page.goto(PAGE_URL)
  await page.getByTestId('import-input').setInputFiles({
    name: 'sunset.png',
    mimeType: 'image/png',
    buffer: await sunsetPng(page),
  })
  const canvas = page.locator('canvas.canvas')
  const box = await canvas.boundingBox()
  const at = (x, y) => [box.x + (x / 256) * box.width, box.y + (y / 144) * box.height]
  const stroke = async (points) => {
    await page.mouse.move(...at(...points[0]))
    await page.mouse.down()
    for (const p of points.slice(1)) await page.mouse.move(...at(...p), { steps: 4 })
    await page.mouse.up()
  }
  // a few birds, drawn with the brush
  await page.getByLabel('Brush color').fill('#ffffff')
  await page.getByLabel('Brush size', { exact: true }).evaluate((el) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, '2')
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
  for (const [x, y] of [[44, 58], [66, 44], [86, 64], [196, 50], [214, 38]]) {
    await stroke([[x - 7, y - 4], [x, y], [x + 7, y - 4]])
  }
  await page.getByLabel('Brush color').fill('#ff6b9d')
  await page.mouse.move(2, 2)
  return page
}

const metricsReady = () =>
  [...document.querySelectorAll('.export-sizes tbody tr')].every(
    (r) => r.querySelector('.bytes')?.getAttribute('data-bytes') && r.querySelector('.colors')?.getAttribute('data-colors') !== null,
  )

async function takeScreenshots(browser) {
  // 1. main interface
  const main = await preparedPage(browser, viewportFor(HERO_W))
  // The poster wants a compact version of the same UI: the canvas on top and the setting cards in a
  // 2×2 grid below it (the live layout has a tall sidebar next to a low canvas, which leaves a blank area).
  await main.addStyleTag({
    content: `
      .workspace { grid-template-columns: minmax(0, 1fr) !important; }
      .canvas-area { position: static !important; }
      .sidebar { display: grid !important; grid-template-columns: 1fr 1fr; gap: 12px; }`,
  })
  const wb = await main.locator('.workspace').boundingBox()
  const pad = 16
  const hero = await main.screenshot({
    clip: { x: wb.x - pad, y: wb.y - pad, width: wb.width + 2 * pad, height: wb.height + 2 * pad },
  })
  await main.close()

  // 2 + 3. information blocks (the same width, so the text is the same size)
  const info = await preparedPage(browser, viewportFor(RIGHT_W))
  await info.addStyleTag({
    content: `
      .export-sizes table, .export-sizes .quality { max-width: none !important; }
      .export-sizes .hint { display: none; }`,
  })
  await info.getByRole('button', { name: /Canvas info/ }).click()
  await info.getByRole('button', { name: /Formats: file sizes/ }).click()
  await info.waitForFunction(metricsReady, null, { timeout: 60_000 })
  await info.mouse.move(2, 2)
  const sections = info.locator('section.collapsible')
  const infoShot = await sections.nth(0).screenshot()
  // Formats: the header, the slider and the table — without the long footnotes.
  const formats = sections.nth(1)
  const fb = await formats.boundingBox()
  const tb = await formats.locator('.table-scroll').boundingBox()
  const formatsShot = await info.screenshot({
    clip: { x: fb.x, y: fb.y, width: fb.width, height: tb.y + tb.height - fb.y + 10 },
  })
  await info.close()
  return { hero, infoShot, formatsShot }
}

const dataUri = (png) => `data:image/png;base64,${png.toString('base64')}`

function posterHtml({ hero, infoShot, formatsShot }) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: ${POSTER.width}px; height: ${POSTER.height}px; overflow: hidden; position: relative; color: #fff;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    background:
      radial-gradient(900px 520px at 88% -8%, rgba(247, 163, 92, 0.35), transparent 70%),
      radial-gradient(800px 600px at 0% 110%, rgba(184, 87, 127, 0.30), transparent 70%),
      linear-gradient(160deg, #14122b, #241c47 60%, #3a2f6b);
  }
  /* a faint pixel grid */
  body::before {
    content: ''; position: absolute; inset: 0; opacity: 0.5;
    background-image: linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px);
    background-size: 20px 20px;
  }
  header { position: absolute; left: ${MARGIN + 6}px; right: ${MARGIN + 6}px; top: 30px; display: flex; justify-content: space-between; align-items: flex-end; }
  h1 { font-size: 66px; line-height: 1; letter-spacing: -2px; font-weight: 800; }
  h1 span { color: #fbc873; }
  .tag { margin-top: 12px; font-size: 25px; color: #d4cdf7; }
  .chips { display: flex; flex-wrap: wrap; gap: 9px; justify-content: flex-end; max-width: 560px; }
  .chip { padding: 7px 14px; border-radius: 999px; font-size: 17px; font-weight: 600; background: rgba(255,255,255,.10); border: 1px solid rgba(255,255,255,.22); }
  .chip.hot { background: #fbc873; color: #241c47; border-color: transparent; }
  main { position: absolute; left: ${MARGIN}px; right: ${MARGIN}px; top: 168px; display: grid; grid-template-columns: ${HERO_W}px ${RIGHT_W}px; column-gap: ${GAP}px; }
  .col { display: flex; flex-direction: column; gap: 14px; min-height: 0; }
  .cap { font-size: 21px; font-weight: 700; letter-spacing: -0.2px; }
  .cap b { display: inline-grid; place-items: center; width: 30px; height: 30px; margin-right: 10px; border-radius: 50%; background: #fbc873; color: #241c47; font-size: 17px; }
  .card { background: #fff; border-radius: 14px; overflow: hidden; box-shadow: 0 24px 60px rgba(8, 6, 24, .55), 0 0 0 1px rgba(255,255,255,.08); }
  .card img { display: block; width: 100%; }
  .stack { display: flex; flex-direction: column; gap: 10px; }
  </style></head><body>
  <header>
    <div>
      <h1>Canvas <span>playground</span></h1>
      <div class="tag">Draw pixels. See what every format does to them.</div>
    </div>
    <div class="chips">
      <span class="chip hot">Pixel by pixel</span><span class="chip">PNG</span><span class="chip">JPG</span><span class="chip">WEBP</span>
      <span class="chip">AVIF</span><span class="chip">SVG</span><span class="chip">RLE JSON</span><span class="chip">Delta+RLE JSON</span>
    </div>
  </header>
  <main>
    <div class="col">
      <div class="cap"><b>1</b>Draw, import and set up the canvas</div>
      <div class="card"><img src="${dataUri(hero)}"></div>
    </div>
    <div class="col" style="justify-content: space-between">
      <div class="stack">
        <div class="cap"><b>2</b>Inspect pixels and colors</div>
        <div class="card"><img src="${dataUri(infoShot)}"></div>
      </div>
      <div class="stack">
        <div class="cap"><b>3</b>Compare size and colors of every format</div>
        <div class="card"><img src="${dataUri(formatsShot)}"></div>
      </div>
    </div>
  </main>
  </body></html>`
}

try {
  await waitForServer()
  const browser = await chromium.launch({ channel: 'chrome' })
  const shots = await takeScreenshots(browser)
  const poster = await browser.newPage({
    viewport: { width: POSTER.width, height: POSTER.height },
    deviceScaleFactor: POSTER.scale,
  })
  await poster.setContent(posterHtml(shots))
  await poster.waitForLoadState('load')
  await poster.screenshot({ path: OUT })
  // Report whether anything overflows the poster, so a layout problem does not go unnoticed.
  const overflow = await poster.evaluate(() => {
    const body = document.body.getBoundingClientRect()
    return [...document.querySelectorAll('.card')].map((el) => Math.round(el.getBoundingClientRect().bottom - body.bottom))
  })
  console.log(`Saved ${OUT}; card bottoms vs poster bottom (px, must be < 0): ${overflow.join(', ')}`)
  await browser.close()
} finally {
  stop()
}
