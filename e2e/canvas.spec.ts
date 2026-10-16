import { readFile, stat } from 'node:fs/promises'
import { expect, test, type Download, type Locator, type Page } from '@playwright/test'

const canvasOf = (page: Page) => page.locator('canvas.canvas')
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })

async function size(canvas: Locator) {
  return canvas.evaluate((c: HTMLCanvasElement) => [c.width, c.height])
}

/** Painted pixels (alpha > 0) and the color at a point — read straight from the <canvas> pixels. */
async function paintedCount(canvas: Locator) {
  return canvas.evaluate((c: HTMLCanvasElement) => {
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data
    let n = 0
    for (let i = 3; i < d.length; i += 4) if (d[i]) n++
    return n
  })
}

async function pixelAt(canvas: Locator, x: number, y: number) {
  return canvas.evaluate(
    (c: HTMLCanvasElement, [px, py]) => [...c.getContext('2d')!.getImageData(px, py, 1, 1).data],
    [x, y],
  )
}

/** Canvas pixel coordinates -> page coordinates (the pixel center). */
async function toPage(canvas: Locator, px: number, py: number) {
  // The information blocks open below the canvas and may scroll the page — bring the canvas back into view.
  await canvas.scrollIntoViewIfNeeded()
  const box = (await canvas.boundingBox())!
  const [w, h] = await size(canvas)
  return { x: box.x + ((px + 0.5) * box.width) / w, y: box.y + ((py + 0.5) * box.height) / h }
}

async function stroke(page: Page, from: [number, number], to: [number, number]) {
  const canvas = canvasOf(page)
  const a = await toPage(canvas, ...from)
  const b = await toPage(canvas, ...to)
  await page.mouse.move(a.x, a.y)
  await page.mouse.down()
  await page.mouse.move(b.x, b.y, { steps: 8 })
  await page.mouse.up()
}

async function click(page: Page, at: [number, number]) {
  await stroke(page, at, at)
}

const slider = (page: Page) => page.getByLabel('Brush size', { exact: true })
const colorInput = (page: Page) => page.getByLabel('Brush color', { exact: true })
const qualitySelect = (page: Page) => page.getByLabel('Quality', { exact: true })

async function setBrush(page: Page, value: number) {
  await slider(page).evaluate((el: HTMLInputElement, v) => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    set.call(el, String(v))
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }, value)
}

async function download(page: Page, name: string): Promise<Download> {
  const [dl] = await Promise.all([page.waitForEvent('download'), button(page, name).click()])
  return dl
}


const INFO_TITLE = 'Canvas info and colors'
const FORMATS_TITLE = 'Formats: file sizes and colors'
const toggleBlock = (page: Page, title: string) => page.getByRole('button', { name: title })

async function openBlock(page: Page, title: string) {
  const toggle = toggleBlock(page, title)
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
}
/** "Canvas info and colors". */
const openInfo = (page: Page) => openBlock(page, INFO_TITLE)
/** "Formats: file sizes and colors". */
const openFormats = (page: Page) => openBlock(page, FORMATS_TITLE)

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test.describe('canvas', () => {
  test('starts as an empty 256×144 (16:9, 144p) canvas', async ({ page }) => {
    const canvas = canvasOf(page)
    expect(await size(canvas)).toEqual([256, 144])
    expect(await paintedCount(canvas)).toBe(0)
    await expect(page.locator('.status')).toContainText('256×144')
  })

  test('draws with the brush color and connects points without gaps', async ({ page }) => {
    const canvas = canvasOf(page)
    await setBrush(page, 1)
    await stroke(page, [20, 20], [220, 120])
    expect(await pixelAt(canvas, 20, 20)).toEqual([229, 72, 77, 255]) // #e5484d by default
    expect(await pixelAt(canvas, 220, 120)).toEqual([229, 72, 77, 255])
    expect(await pixelAt(canvas, 200, 20)).toEqual([0, 0, 0, 0])
    // a 1px line from (20,20) to (220,120): Bresenham gives max(dx, dy)+1 pixels
    expect(await paintedCount(canvas)).toBe(201)
  })

  test('brush size changes stroke thickness', async ({ page }) => {
    const canvas = canvasOf(page)
    await setBrush(page, 1)
    await click(page, [50, 50])
    expect(await paintedCount(canvas)).toBe(1)

    await button(page, 'Reset').click()
    await setBrush(page, 10)
    await click(page, [50, 50])
    expect(await paintedCount(canvas)).toBe(100)
  })

  test('brush shape: round paints fewer pixels than square', async ({ page }) => {
    const canvas = canvasOf(page)
    await setBrush(page, 5)
    await click(page, [50, 50])
    expect(await paintedCount(canvas)).toBe(25)

    await button(page, 'Reset').click()
    await button(page, 'Round').click()
    await click(page, [50, 50])
    expect(await paintedCount(canvas)).toBe(21)
  })

  test('brush color updates in real time', async ({ page }) => {
    const canvas = canvasOf(page)
    await setBrush(page, 1)
    await colorInput(page).fill('#00ff00')
    await expect(page.getByTestId('brush-color')).toHaveText('#00ff00')
    await click(page, [10, 10])
    expect(await pixelAt(canvas, 10, 10)).toEqual([0, 255, 0, 255])
  })

  test('reset clears the canvas and keeps its size', async ({ page }) => {
    const canvas = canvasOf(page)
    await stroke(page, [10, 10], [100, 100])
    expect(await paintedCount(canvas)).toBeGreaterThan(0)
    await button(page, 'Reset').click()
    expect(await paintedCount(canvas)).toBe(0)
    expect(await size(canvas)).toEqual([256, 144])
  })

  test('hover shows coordinates and pixel color', async ({ page }) => {
    await setBrush(page, 1)
    await click(page, [30, 40])
    const p = await toPage(canvasOf(page), 30, 40)
    await page.mouse.move(p.x, p.y)
    await expect(page.locator('.status')).toContainText('x:30 y:40 · #e5484d')
    const q = await toPage(canvasOf(page), 31, 40)
    await page.mouse.move(q.x, q.y)
    await expect(page.locator('.status')).toContainText('x:31 y:40 · empty')
  })

  test('dragging out of the canvas does not break drawing', async ({ page }) => {
    const canvas = canvasOf(page)
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await setBrush(page, 1)
    const start = await toPage(canvas, 128, 72)
    await page.mouse.move(start.x, start.y)
    await page.mouse.down()
    await page.mouse.move(5, 5, { steps: 5 }) // outside the canvas
    await page.mouse.up()
    expect(errors).toEqual([])
    expect(await paintedCount(canvas)).toBeGreaterThan(50)
    expect(await pixelAt(canvas, 0, 0)).toEqual([229, 72, 77, 255]) // clamped to the edge
  })
})

test.describe('quality and aspect ratio', () => {
  const qualities: [string, number][] = [
    ['72', 72], ['144', 144], ['240', 240], ['360', 360], ['480', 480],
    ['720', 720], ['1080', 1080], ['1440', 1440], ['2160', 2160],
  ]

  for (const [value, short] of qualities) {
    test(`quality ${short}p at 16:9`, async ({ page }) => {
      await qualitySelect(page).selectOption(value)
      expect(await size(canvasOf(page))).toEqual([Math.round((short * 16) / 9), short])
    })
  }

  const ratios: [string, number, number][] = [
    ['21:9', 336, 144], ['16:9', 256, 144], ['4:3', 192, 144],
    ['1:1', 144, 144], ['3:4', 144, 192], ['9:16', 144, 256],
  ]

  for (const [label, w, h] of ratios) {
    test(`ratio ${label} at 144p -> ${w}×${h}`, async ({ page }) => {
      await button(page, label).click()
      expect(await size(canvasOf(page))).toEqual([w, h])
      await expect(button(page, label)).toHaveClass(/active/)
      // the displayed canvas keeps its proportions
      const box = (await canvasOf(page).boundingBox())!
      expect(box.width / box.height).toBeCloseTo(w / h, 1)
    })
  }

  test('keeps the drawing when quality changes (scaled proportionally)', async ({ page }) => {
    const canvas = canvasOf(page)
    await setBrush(page, 8)
    await click(page, [64, 36]) // exactly in the first quarter on both axes
    await qualitySelect(page).selectOption('720') // 144 -> 720 (×5)
    expect(await size(canvas)).toEqual([1280, 720])
    expect(await paintedCount(canvas)).toBeGreaterThan(0)
    expect(await pixelAt(canvas, 64 * 5 + 2, 36 * 5 + 2)).toEqual([229, 72, 77, 255])
    expect(await pixelAt(canvas, 900, 600)).toEqual([0, 0, 0, 0])
  })

  test('the canvas never overflows the page horizontally in portrait 4K', async ({ page }) => {
    await button(page, '9:16').click()
    await qualitySelect(page).selectOption('2160')
    expect(await size(canvasOf(page))).toEqual([2160, 3840])
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })

  test('brush size is capped when switching to a smaller canvas', async ({ page }) => {
    const canvas = canvasOf(page)
    await qualitySelect(page).selectOption('2160') // max brush = 540
    await setBrush(page, 540)
    await qualitySelect(page).selectOption('72') // max brush = 18
    await click(page, [64, 36])
    // The brush must be no bigger than the slider allows (18×18), not 540×540 painting everything.
    expect(await paintedCount(canvas)).toBeLessThanOrEqual(18 * 18)
    await expect(page.getByText(/Size: 18px/)).toBeVisible()
  })
})

test.describe('info panel', () => {
  test('toggles and describes an empty canvas', async ({ page }) => {
    await expect(page.locator('.info')).toHaveCount(0)
    await openInfo(page)
    const info = page.locator('.info')
    await expect(info).toBeVisible()
    await expect(info).toContainText('256×144 (36,864 px)')
    await expect(info).toContainText('0 px (0.00%)')
    await expect(info).toContainText('The canvas is empty')
    await toggleBlock(page, INFO_TITLE).click()
    await expect(page.locator('.info')).toHaveCount(0)
    await expect(toggleBlock(page, INFO_TITLE)).toHaveAttribute('aria-expanded', 'false')
  })

  test('reflects strokes: counts, bbox, colors, pixel list', async ({ page }) => {
    await setBrush(page, 1)
    await stroke(page, [10, 20], [14, 20]) // 5 red
    await colorInput(page).fill('#0000ff')
    await stroke(page, [30, 40], [30, 41]) // 2 blue
    await openInfo(page)
    const info = page.locator('.info')
    await expect(info).toContainText('7 px (0.02%)')
    await expect(info).toContainText('x 10…30, y 20…41')
    const colors = info.locator('.tables > div').first().locator('tbody tr')
    await expect(colors).toHaveCount(2)
    await expect(colors.nth(0)).toContainText('#e5484d')
    await expect(colors.nth(0)).toContainText('5')
    await expect(colors.nth(1)).toContainText('#0000ff')
    const pixels = info.locator('.tables > div').nth(1).locator('tbody tr')
    await expect(pixels).toHaveCount(7)
    await expect(pixels.first()).toContainText('10')
    await expect(pixels.first()).toContainText('229')
    await expect(pixels.last()).toContainText('#0000ff')
    await expect(info).toContainText('Showing all painted pixels')
  })

  test('updates after the next stroke and after reset', async ({ page }) => {
    await setBrush(page, 1)
    await openInfo(page)
    const info = page.locator('.info')
    await click(page, [5, 5])
    await expect(info).toContainText('1 px')
    await click(page, [6, 5])
    await expect(info).toContainText('2 px')
    await button(page, 'Reset').click()
    await expect(info).toContainText('0 px (0.00%)')
  })

  test('truncates the pixel list to 500 rows and says so', async ({ page }) => {
    await setBrush(page, 36) // the maximum for 144p: 144 / 4
    await click(page, [100, 70])
    await openInfo(page)
    const info = page.locator('.info')
    await expect(info.locator('.tables > div').nth(1).locator('tbody tr')).toHaveCount(500)
    await expect(info).toContainText('Showing the first 500 of 1,296')
  })

  test('shows new size after resolution change', async ({ page }) => {
    await openInfo(page)
    await button(page, '1:1').click()
    await expect(page.locator('.info')).toContainText('144×144 (20,736 px)')
  })

  test('downloads the full state as JSON runs', async ({ page }) => {
    await setBrush(page, 1)
    await stroke(page, [10, 20], [14, 20])
    await openInfo(page)
    const dl = await download(page, 'Download')
    expect(dl.suggestedFilename()).toBe('canvas-256x144.json')
    const state = JSON.parse(await readFile((await dl.path())!, 'utf8'))
    expect(state).toEqual({
      width: 256,
      height: 144,
      painted: 5,
      palette: ['#e5484d'],
      rows: { 20: [[10, 5, 0]] },
    })
  })
})

test.describe('export', () => {
  test.beforeEach(async ({ page }) => {
    await setBrush(page, 6)
    await stroke(page, [30, 30], [200, 100])
  })

  test('PNG has the right signature and dimensions', async ({ page }) => {
    const dl = await download(page, 'PNG')
    expect(dl.suggestedFilename()).toBe('canvas-256x144.png')
    const buf = await readFile((await dl.path())!)
    expect(buf.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
    expect([buf.readUInt32BE(16), buf.readUInt32BE(20)]).toEqual([256, 144])
  })

  test('JPG is a JPEG file', async ({ page }) => {
    const dl = await download(page, 'JPG')
    expect(dl.suggestedFilename()).toBe('canvas-256x144.jpg')
    const buf = await readFile((await dl.path())!)
    expect(buf.subarray(0, 3).toString('hex')).toBe('ffd8ff')
  })

  test('WEBP is a WebP file', async ({ page }) => {
    const dl = await download(page, 'WEBP')
    expect(dl.suggestedFilename()).toBe('canvas-256x144.webp')
    const buf = await readFile((await dl.path())!)
    expect(buf.subarray(0, 4).toString()).toBe('RIFF')
    expect(buf.subarray(8, 12).toString()).toBe('WEBP')
  })

  test('SVG reproduces the drawing and is valid XML', async ({ page }) => {
    const dl = await download(page, 'SVG')
    expect(dl.suggestedFilename()).toBe('canvas-256x144.svg')
    const svg = await readFile((await dl.path())!, 'utf8')
    expect(svg).toContain('viewBox="0 0 256 144"')
    expect(svg).toContain('fill="#e5484d"')

    // Render the SVG with the browser and compare it with the source canvas.
    const diff = await page.evaluate(async (markup) => {
      const img = new Image()
      img.src = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml' }))
      await img.decode()
      const source = document.querySelector('canvas.canvas') as HTMLCanvasElement
      const copy = document.createElement('canvas')
      copy.width = source.width
      copy.height = source.height
      const ctx = copy.getContext('2d')!
      ctx.drawImage(img, 0, 0)
      const a = ctx.getImageData(0, 0, copy.width, copy.height).data
      const b = source.getContext('2d')!.getImageData(0, 0, source.width, source.height).data
      let bad = 0
      for (let i = 0; i < a.length; i += 4) {
        // compare coverage and the color of painted pixels
        if ((a[i + 3] > 127) !== (b[i + 3] > 127)) bad++
        else if (b[i + 3] && (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2])) bad++
      }
      return bad
    }, svg)
    expect(diff).toBe(0)
  })

  test('file name follows the current resolution', async ({ page }) => {
    await button(page, '1:1').click()
    const dl = await download(page, 'PNG')
    expect(dl.suggestedFilename()).toBe('canvas-144x144.png')
  })

  test('shows no error notice on success', async ({ page }) => {
    await download(page, 'PNG')
    await expect(page.locator('.notice')).toHaveCount(0)
  })
})

// ---------------------------------------------------------------------------------------------
// Image import
// ---------------------------------------------------------------------------------------------

type Rect = [x: number, y: number, w: number, h: number, color: string]

/** A PNG made of a set of rectangles on a transparent background; drawn by the browser itself. */
async function makePng(page: Page, w: number, h: number, rects: Rect[]) {
  const bytes = await page.evaluate(
    async ({ w, h, rects }) => {
      const c = document.createElement('canvas')
      c.width = w
      c.height = h
      const ctx = c.getContext('2d')!
      for (const [x, y, rw, rh, color] of rects) {
        ctx.fillStyle = color
        ctx.fillRect(x, y, rw, rh)
      }
      const blob = await new Promise<Blob>((res) => c.toBlob((b) => res(b!), 'image/png'))
      return [...new Uint8Array(await blob.arrayBuffer())]
    },
    { w, h, rects },
  )
  return Buffer.from(bytes)
}

const importInput = (page: Page) => page.getByTestId('import-input')

async function importPng(page: Page, buffer: Buffer, name = 'image.png') {
  await importInput(page).setInputFiles({ name, mimeType: 'image/png', buffer })
}

const LEFT_RED_RIGHT_BLUE: Rect[] = [
  [0, 0, 2, 4, '#ff0000'],
  [2, 0, 2, 4, '#0000ff'],
]

test.describe('image import', () => {
  test('default mode is original, which disables scaling options', async ({ page }) => {
    await expect(page.getByLabel('Fit mode')).toHaveValue('original')
    await expect(page.getByLabel('Smoothing')).toBeDisabled()
    await expect(page.getByLabel('Match aspect ratio')).toBeDisabled()
    await page.getByLabel('Fit mode').selectOption('contain')
    await expect(page.getByLabel('Smoothing')).toBeEnabled()
    await expect(page.getByLabel('Match aspect ratio')).toBeEnabled()
  })

  test('original: a 300×300 image lands pixel-for-pixel in the center of a 1080 1:1 canvas', async ({ page }) => {
    const canvas = canvasOf(page)
    await button(page, '1:1').click()
    await qualitySelect(page).selectOption('1080')
    expect(await size(canvas)).toEqual([1080, 1080])
    await importPng(page, await makePng(page, 300, 300, [
      [0, 0, 150, 300, '#ff0000'],
      [150, 0, 150, 300, '#0000ff'],
    ]))
    // the canvas did not change
    expect(await size(canvas)).toEqual([1080, 1080])
    // exactly 300×300 pixels, with no scaling and no blur
    expect(await paintedCount(canvas)).toBe(300 * 300)
    expect(await pixelAt(canvas, 389, 540)).toEqual([0, 0, 0, 0])
    expect(await pixelAt(canvas, 390, 540)).toEqual([255, 0, 0, 255])
    expect(await pixelAt(canvas, 390 + 149, 540)).toEqual([255, 0, 0, 255])
    expect(await pixelAt(canvas, 390 + 150, 540)).toEqual([0, 0, 255, 255]) // a sharp boundary
    expect(await pixelAt(canvas, 689, 540)).toEqual([0, 0, 255, 255])
    expect(await pixelAt(canvas, 690, 540)).toEqual([0, 0, 0, 0])
    expect(await pixelAt(canvas, 540, 389)).toEqual([0, 0, 0, 0])
    expect(await pixelAt(canvas, 540, 690)).toEqual([0, 0, 0, 0])
    await openInfo(page)
    await expect(page.locator('.info')).toContainText('Unique colors2')
  })

  test('original: every source pixel maps to exactly one canvas pixel', async ({ page }) => {
    const canvas = canvasOf(page)
    // 3 separate pixels in different places of a 20×10 image on a 256×144 canvas (center: x=118, y=67)
    await importPng(page, await makePng(page, 20, 10, [
      [0, 0, 1, 1, '#ff0000'],
      [19, 0, 1, 1, '#00ff00'],
      [7, 9, 1, 1, '#0000ff'],
    ]))
    expect(await paintedCount(canvas)).toBe(3)
    expect(await pixelAt(canvas, 118, 67)).toEqual([255, 0, 0, 255])
    expect(await pixelAt(canvas, 137, 67)).toEqual([0, 255, 0, 255])
    expect(await pixelAt(canvas, 125, 76)).toEqual([0, 0, 255, 255])
  })

  test('original: keeps the chosen ratio even if the image has another one', async ({ page }) => {
    await importPng(page, await makePng(page, 90, 160, [[0, 0, 90, 160, '#ff0000']]))
    expect(await size(canvasOf(page))).toEqual([256, 144])
    await expect(button(page, '16:9')).toHaveClass(/active/)
  })

  test('original: an image larger than the canvas is cropped around the center', async ({ page }) => {
    const canvas = canvasOf(page)
    // 300×200 on 256×144: offset (-22, -28); the image pixel (22, 28) lands at (0, 0)
    await importPng(page, await makePng(page, 300, 200, [
      [0, 0, 300, 200, '#ff0000'],
      [22, 28, 1, 1, '#00ff00'],
    ]))
    expect(await paintedCount(canvas)).toBe(256 * 144)
    expect(await pixelAt(canvas, 0, 0)).toEqual([0, 255, 0, 255])
    expect(await pixelAt(canvas, 1, 0)).toEqual([255, 0, 0, 255])
  })

  test('stretch fills the whole canvas with the image pixels', async ({ page }) => {
    const canvas = canvasOf(page)
    await page.getByLabel('Fit mode').selectOption('stretch')
    await page.getByLabel('Smoothing').uncheck()
    await importPng(page, await makePng(page, 4, 4, LEFT_RED_RIGHT_BLUE))
    // the aspect ratio was matched to 1:1, the quality did not change
    expect(await size(canvas)).toEqual([144, 144])
    expect(await paintedCount(canvas)).toBe(144 * 144)
    expect(await pixelAt(canvas, 5, 70)).toEqual([255, 0, 0, 255])
    expect(await pixelAt(canvas, 138, 70)).toEqual([0, 0, 255, 255])
  })

  test('without smoothing only the original colors remain', async ({ page }) => {
    await page.getByLabel('Fit mode').selectOption('stretch')
    await page.getByLabel('Smoothing').uncheck()
    await importPng(page, await makePng(page, 4, 4, LEFT_RED_RIGHT_BLUE))
    await openInfo(page)
    await expect(page.locator('.info')).toContainText('Unique colors2')
  })

  test('with smoothing, upscaling blends the colors', async ({ page }) => {
    await page.getByLabel('Fit mode').selectOption('stretch')
    await importPng(page, await makePng(page, 4, 4, LEFT_RED_RIGHT_BLUE))
    await openInfo(page)
    const text = await page.locator('.summary').innerText()
    const colors = Number(/Unique colors\s*(\d+)/.exec(text)![1])
    expect(colors).toBeGreaterThan(2)
  })

  test('contain keeps the aspect ratio and leaves empty bars', async ({ page }) => {
    const canvas = canvasOf(page)
    await page.getByLabel('Fit mode').selectOption('contain')
    await page.getByLabel('Match aspect ratio').uncheck() // stays 16:9, 256×144
    await page.getByLabel('Smoothing').uncheck()
    await importPng(page, await makePng(page, 2, 2, [[0, 0, 2, 2, '#00ff00']])) // a square
    expect(await size(canvas)).toEqual([256, 144])
    // a 144×144 square in the center: 56px bars on the left and right
    expect(await paintedCount(canvas)).toBe(144 * 144)
    expect(await pixelAt(canvas, 10, 70)).toEqual([0, 0, 0, 0])
    expect(await pixelAt(canvas, 128, 70)).toEqual([0, 255, 0, 255])
    expect(await pixelAt(canvas, 250, 70)).toEqual([0, 0, 0, 0])
  })

  test('cover fills the canvas and crops the overflow', async ({ page }) => {
    const canvas = canvasOf(page)
    await page.getByLabel('Fit mode').selectOption('cover')
    await page.getByLabel('Match aspect ratio').uncheck()
    await page.getByLabel('Smoothing').uncheck()
    await importPng(page, await makePng(page, 2, 2, [[0, 0, 2, 2, '#00ff00']]))
    expect(await paintedCount(canvas)).toBe(256 * 144)
  })

  test('transparent areas of the image stay empty', async ({ page }) => {
    const canvas = canvasOf(page)
    await page.getByLabel('Fit mode').selectOption('stretch')
    await page.getByLabel('Smoothing').uncheck()
    await importPng(page, await makePng(page, 4, 4, [[0, 0, 2, 4, '#ff0000']])) // the right half is transparent
    expect(await paintedCount(canvas)).toBe(72 * 144)
    expect(await pixelAt(canvas, 100, 10)).toEqual([0, 0, 0, 0])
  })

  test('matches the canvas ratio to the image', async ({ page }) => {
    await page.getByLabel('Fit mode').selectOption('contain')
    await importPng(page, await makePng(page, 90, 160, [[0, 0, 90, 160, '#ff0000']]))
    expect(await size(canvasOf(page))).toEqual([144, 256]) // 9:16 at 144p
    await expect(button(page, '9:16')).toHaveClass(/active/)
  })

  test('replaces the previous drawing and can be exported afterwards', async ({ page }) => {
    const canvas = canvasOf(page)
    await setBrush(page, 1)
    await stroke(page, [10, 10], [100, 10])
    await page.getByLabel('Fit mode').selectOption('stretch')
    await page.getByLabel('Match aspect ratio').uncheck()
    await page.getByLabel('Smoothing').uncheck()
    await importPng(page, await makePng(page, 2, 2, [[0, 0, 1, 2, '#0000ff']]))
    expect(await paintedCount(canvas)).toBe(128 * 144) // the old line is gone
    expect(await pixelAt(canvas, 50, 10)).toEqual([0, 0, 255, 255])
    const dl = await download(page, 'PNG')
    expect(dl.suggestedFilename()).toBe('canvas-256x144.png')
  })

  test('the same file can be imported twice in a row', async ({ page }) => {
    const canvas = canvasOf(page)
    await page.getByLabel('Fit mode').selectOption('stretch')
    await page.getByLabel('Match aspect ratio').uncheck()
    const png = await makePng(page, 2, 2, [[0, 0, 2, 2, '#ff0000']])
    await importPng(page, png)
    await button(page, 'Reset').click()
    expect(await paintedCount(canvas)).toBe(0)
    await importPng(page, png)
    expect(await paintedCount(canvas)).toBe(256 * 144)
  })

  test('shows an error for a file that is not an image', async ({ page }) => {
    await importInput(page).setInputFiles({
      name: 'notes.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('hello'),
    })
    await expect(page.locator('.notice')).toHaveText('Only images and canvas JSON files are supported')
    expect(await paintedCount(canvasOf(page))).toBe(0)
  })

  test('shows an error for a broken image file', async ({ page }) => {
    await importPng(page, Buffer.from('definitely not a png'), 'broken.png')
    await expect(page.locator('.notice')).toContainText('Could not read')
  })

  test('accepts a file dropped onto the canvas area', async ({ page }) => {
    const canvas = canvasOf(page)
    await page.getByLabel('Fit mode').selectOption('stretch')
    await page.getByLabel('Match aspect ratio').uncheck()
    const png = await makePng(page, 2, 2, [[0, 0, 2, 2, '#ff00ff']])
    const dataTransfer = await page.evaluateHandle(async (bytes) => {
      const dt = new DataTransfer()
      dt.items.add(new File([new Uint8Array(bytes)], 'drop.png', { type: 'image/png' }))
      return dt
    }, [...png])
    await page.dispatchEvent('.stage', 'dragover', { dataTransfer })
    await expect(page.locator('.stage')).toHaveClass(/drag-over/)
    await page.dispatchEvent('.stage', 'drop', { dataTransfer })
    await expect(page.locator('.stage')).not.toHaveClass(/drag-over/)
    expect(await paintedCount(canvas)).toBe(256 * 144)
    expect(await pixelAt(canvas, 100, 70)).toEqual([255, 0, 255, 255])
  })
})

// ---------------------------------------------------------------------------------------------
// JSON export/import: RLE and Delta+RLE
// ---------------------------------------------------------------------------------------------

/** Size and a hash of all canvas pixels — to compare whole drawings. */
async function snapshot(canvas: Locator) {
  return canvas.evaluate((c: HTMLCanvasElement) => {
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data
    let h = 2166136261
    for (let i = 0; i < d.length; i++) {
      h ^= d[i]
      h = Math.imul(h, 16777619)
    }
    return `${c.width}x${c.height}:${h >>> 0}`
  })
}

async function drawSample(page: Page) {
  await setBrush(page, 3)
  await stroke(page, [10, 10], [200, 60])
  await colorInput(page).fill('#0091ff')
  await button(page, 'Round').click()
  await setBrush(page, 6)
  await stroke(page, [30, 120], [220, 20])
  await colorInput(page).fill('#30a46c')
  await setBrush(page, 1)
  await stroke(page, [128, 0], [128, 143])
}

async function saveJson(page: Page, format: 'RLE JSON' | 'Delta+RLE JSON') {
  await page.getByLabel('Export format').selectOption({ label: format })
  const dl = await download(page, 'Download')
  // Save under a real name (Playwright's temp file is a UUID without an extension).
  const path = test.info().outputPath(dl.suggestedFilename())
  await dl.saveAs(path)
  return { path, filename: dl.suggestedFilename() }
}

const jsonOf = async (path: string) => JSON.parse(await readFile(path, 'utf8'))

test.describe('JSON export', () => {
  test('Delta+RLE: stores neighbor deltas as runs', async ({ page }) => {
    await setBrush(page, 1)
    await stroke(page, [10, 20], [14, 20]) // 5 red pixels in a row, indices 5130…5134
    const { path, filename } = await saveJson(page, 'Delta+RLE JSON')
    expect(filename).toBe('canvas-256x144.delta-rle.json')
    expect(await jsonOf(path)).toEqual({
      format: 'delta-rle',
      version: 1,
      width: 256,
      height: 144,
      painted: 5,
      scan: 'row-major',
      predictor: 'previous-pixel',
      runs: [
        [5130, 0, 0, 0, 0],
        [1, 229, 72, 77, 255],
        [4, 0, 0, 0, 0],
        [1, -229, -72, -77, -255],
        [256 * 144 - 5136, 0, 0, 0, 0],
      ],
    })
  })

  test('JSON formats are chosen from one select with a single download button', async ({ page }) => {
    const card = page.getByRole('region', { name: 'Download' })
    const select = card.getByLabel('Export format')
    await expect(select.locator('option')).toHaveText(['RLE JSON', 'Delta+RLE JSON'])
    await expect(select).toHaveValue('rle') // the previous format by default
    await expect(card.getByRole('button', { name: 'Download', exact: true })).toHaveCount(1)
  })

  test('the selected format is kept while drawing (the panel re-renders after each stroke)', async ({ page }) => {
    await openInfo(page)
    await page.getByLabel('Export format').selectOption({ label: 'Delta+RLE JSON' })
    await setBrush(page, 1)
    await click(page, [5, 5])
    await click(page, [6, 5])
    await expect(page.getByLabel('Export format')).toHaveValue('delta-rle')
    const dl = await download(page, 'Download')
    expect(dl.suggestedFilename()).toBe('canvas-256x144.delta-rle.json')
  })

  test('download follows the selected format', async ({ page }) => {
    await setBrush(page, 1)
    await click(page, [5, 5])
    expect((await jsonOf((await saveJson(page, 'RLE JSON')).path)).palette).toEqual(['#e5484d'])
    expect((await jsonOf((await saveJson(page, 'Delta+RLE JSON')).path)).format).toBe('delta-rle')
  })

  test('RLE file name is unchanged', async ({ page }) => {
    await setBrush(page, 1)
    await click(page, [5, 5])
    expect((await saveJson(page, 'RLE JSON')).filename).toBe('canvas-256x144.json')
  })
})

test.describe('JSON import', () => {
  for (const format of ['RLE JSON', 'Delta+RLE JSON'] as const) {
    test(`${format}: draw -> download -> reset -> import restores the canvas exactly`, async ({ page }) => {
      const canvas = canvasOf(page)
      await drawSample(page)
      const before = await snapshot(canvas)
      const painted = await paintedCount(canvas)
      expect(painted).toBeGreaterThan(500)

      const { path } = await saveJson(page, format)
      await button(page, 'Reset').click()
      expect(await paintedCount(canvas)).toBe(0)

      await importInput(page).setInputFiles(path)
      await expect(page.locator('.notice')).toHaveCount(0)
      expect(await snapshot(canvas)).toBe(before)
      expect(await paintedCount(canvas)).toBe(painted)
    })

    test(`${format}: import restores the size and the quality/ratio controls`, async ({ page }) => {
      const canvas = canvasOf(page)
      await button(page, '1:1').click()
      await qualitySelect(page).selectOption('240')
      await setBrush(page, 5)
      await stroke(page, [20, 30], [200, 150])
      const before = await snapshot(canvas)
      const { path } = await saveJson(page, format)

      await button(page, '21:9').click()
      await qualitySelect(page).selectOption('72')
      expect(await size(canvas)).toEqual([168, 72])

      await importInput(page).setInputFiles(path)
      expect(await size(canvas)).toEqual([240, 240])
      expect(await snapshot(canvas)).toBe(before)
      await expect(button(page, '1:1')).toHaveClass(/active/)
      await expect(qualitySelect(page)).toHaveValue('240')
    })
  }

  test('the info panel shows the imported state', async ({ page }) => {
    await setBrush(page, 1)
    await stroke(page, [10, 20], [14, 20])
    const { path } = await saveJson(page, 'Delta+RLE JSON')
    await openInfo(page)
    await button(page, 'Reset').click()
    await expect(page.locator('.info')).toContainText('0 px (0.00%)')
    await importInput(page).setInputFiles(path)
    await expect(page.locator('.info')).toContainText('5 px')
    await expect(page.locator('.info')).toContainText('x 10…14, y 20…20')
  })

  test('imports an RLE JSON saved by an earlier version (no "format" field)', async ({ page }) => {
    const canvas = canvasOf(page)
    const legacy = '{"width":256,"height":144,"painted":5,"palette":["#e5484d"],"rows":{"20":[[10,5,0]]}}'
    await importInput(page).setInputFiles({
      name: 'old.json',
      mimeType: 'application/json',
      buffer: Buffer.from(legacy),
    })
    expect(await paintedCount(canvas)).toBe(5)
    expect(await pixelAt(canvas, 10, 20)).toEqual([229, 72, 77, 255])
    expect(await pixelAt(canvas, 14, 20)).toEqual([229, 72, 77, 255])
    expect(await pixelAt(canvas, 15, 20)).toEqual([0, 0, 0, 0])
  })

  test('a file whose size matches no preset is placed in the center with a notice', async ({ page }) => {
    const canvas = canvasOf(page)
    const custom = JSON.stringify({
      width: 10, height: 5, palette: ['#00ff00'], rows: { 2: [[3, 4, 0]] },
    })
    await importInput(page).setInputFiles({ name: 'custom.json', mimeType: 'application/json', buffer: Buffer.from(custom) })
    expect(await size(canvas)).toEqual([256, 144]) // the canvas did not change
    // offset ((256-10)/2, (144-5)/2) = (123, 69): run x=3..6, y=2 -> (126..129, 71)
    expect(await paintedCount(canvas)).toBe(4)
    expect(await pixelAt(canvas, 126, 71)).toEqual([0, 255, 0, 255])
    expect(await pixelAt(canvas, 129, 71)).toEqual([0, 255, 0, 255])
    expect(await pixelAt(canvas, 130, 71)).toEqual([0, 0, 0, 0])
    const notice = page.locator('.notice')
    await expect(notice).toHaveClass(/info/)
    await expect(notice).toContainText('10×5')
    await expect(notice).toContainText('in the center')
  })

  const broken: [string, string, string][] = [
    ['not JSON at all', 'hello {', 'not valid JSON'],
    ['unknown structure', '{"a":1}', 'Unknown format'],
    ['RLE run beyond the width', '{"width":256,"height":144,"palette":["#ff0000"],"rows":{"0":[[250,10,0]]}}', 'goes beyond the width'],
    ['Delta+RLE with wrong pixel count', '{"format":"delta-rle","width":256,"height":144,"runs":[[10,0,0,0,0]]}', 'cover 10 pixels'],
    ['Delta+RLE with channel overflow', '{"format":"delta-rle","width":256,"height":144,"runs":[[1,300,0,0,255],[36863,0,0,0,0]]}', 'left 0…255'],
  ]
  for (const [name, content, message] of broken) {
    test(`rejects ${name} and leaves the canvas untouched`, async ({ page }) => {
      const canvas = canvasOf(page)
      await setBrush(page, 4)
      await stroke(page, [10, 10], [60, 40])
      const before = await snapshot(canvas)
      await importInput(page).setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from(content) })
      const notice = page.locator('.notice')
      await expect(notice).toContainText(message)
      await expect(notice).toHaveClass(/error/)
      expect(await snapshot(canvas)).toBe(before)
    })
  }

  test('recognizes a JSON file by content when it has no .json extension', async ({ page }) => {
    const text = '  \n{"width":256,"height":144,"palette":["#ff0000"],"rows":{"0":[[0,3,0]]}}'
    await importInput(page).setInputFiles({ name: 'canvas-backup', mimeType: 'application/octet-stream', buffer: Buffer.from(text) })
    await expect(page.locator('.notice')).toHaveCount(0)
    expect(await paintedCount(canvasOf(page))).toBe(3)
  })

  test('a successful import clears an earlier error', async ({ page }) => {
    await importInput(page).setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{') })
    await expect(page.locator('.notice')).toBeVisible()
    const ok = '{"width":256,"height":144,"palette":["#ff0000"],"rows":{"0":[[0,1,0]]}}'
    await importInput(page).setInputFiles({ name: 'ok.json', mimeType: 'application/json', buffer: Buffer.from(ok) })
    await expect(page.locator('.notice')).toHaveCount(0)
    expect(await paintedCount(canvasOf(page))).toBe(1)
  })

  test('accepts a JSON file dropped onto the canvas area', async ({ page }) => {
    const canvas = canvasOf(page)
    const text = '{"format":"delta-rle","width":256,"height":144,"runs":[[1,255,0,0,255],[36863,0,0,0,0]]}'
    const dataTransfer = await page.evaluateHandle((t) => {
      const dt = new DataTransfer()
      dt.items.add(new File([t], 'drop.json', { type: 'application/json' }))
      return dt
    }, text)
    await page.dispatchEvent('.stage', 'dragover', { dataTransfer })
    await page.dispatchEvent('.stage', 'drop', { dataTransfer })
    // the first pixel is red, the following deltas are zero — the whole canvas is red
    await expect.poll(() => paintedCount(canvas)).toBe(256 * 144)
    expect(await pixelAt(canvas, 255, 143)).toEqual([255, 0, 0, 255])
  })

  test('4K 21:9 canvas survives a Delta+RLE round trip', async ({ page }) => {
    test.setTimeout(90_000)
    const canvas = canvasOf(page)
    await button(page, '21:9').click()
    await qualitySelect(page).selectOption('2160')
    expect(await size(canvas)).toEqual([5040, 2160])
    await setBrush(page, 40)
    await stroke(page, [200, 200], [4800, 1900])
    const before = await snapshot(canvas)
    const { path } = await saveJson(page, 'Delta+RLE JSON')
    await button(page, 'Reset').click()
    await importInput(page).setInputFiles(path)
    await expect.poll(() => snapshot(canvas), { timeout: 30_000 }).toBe(before)
  })
})

// ---------------------------------------------------------------------------------------------
// File size per format
// ---------------------------------------------------------------------------------------------

const sizeCell = (page: Page, id: string) => page.locator(`.export-sizes [data-format="${id}"] .bytes`)

/** Waits until the format is measured and returns its size in bytes. */
async function shownBytes(page: Page, id: string) {
  await expect(sizeCell(page, id)).toHaveAttribute('data-bytes', /^\d+$/, { timeout: 30_000 })
  return Number(await sizeCell(page, id).getAttribute('data-bytes'))
}

async function fileSize(dl: Download) {
  return (await stat((await dl.path())!)).size
}

const SIZE_IDS = ['png', 'jpg', 'webp', 'svg', 'avif', 'json:rle', 'json:delta-rle']

test.describe('export sizes', () => {
  test('lists every export format and fills in a size for each', async ({ page }) => {
    await setBrush(page, 3)
    await stroke(page, [20, 20], [200, 100])
    await openFormats(page)
    const rows = page.locator('.export-sizes tbody tr')
    await expect(rows).toHaveCount(SIZE_IDS.length)
    await expect(rows.locator('th')).toHaveText(['PNG', 'JPG', 'WEBP', 'SVG', 'AVIF', 'RLE JSON', 'Delta+RLE JSON'])
    for (const id of SIZE_IDS) expect(await shownBytes(page, id)).toBeGreaterThan(0)
    await expect(page.locator('.export-sizes')).not.toContainText('calculating…')
    await expect(page.locator('.export-sizes')).toContainText(/\d+(\.\d)? (B|KB|MB)/)
  })

  test('shown sizes equal the sizes of the files actually downloaded', async ({ page }) => {
    await setBrush(page, 5)
    await stroke(page, [20, 20], [200, 100])
    await colorInput(page).fill('#0091ff')
    await stroke(page, [30, 120], [220, 30])
    await openFormats(page)

    for (const format of ['PNG', 'JPG', 'WEBP', 'SVG'] as const) {
      const expected = await shownBytes(page, format.toLowerCase())
      expect(await fileSize(await download(page, format)), format).toBe(expected)
    }
    for (const [id, label] of [['json:rle', 'RLE JSON'], ['json:delta-rle', 'Delta+RLE JSON']] as const) {
      const expected = await shownBytes(page, id)
      await page.getByLabel('Export format').selectOption({ label })
      expect(await fileSize(await download(page, 'Download')), label).toBe(expected)
    }
  })

  test('highlights the smallest format once everything is measured', async ({ page }) => {
    await setBrush(page, 3)
    await stroke(page, [20, 20], [200, 100])
    await openFormats(page)
    for (const id of SIZE_IDS) await shownBytes(page, id)
    await expect(page.locator('.export-sizes .badge')).toHaveCount(1)
    const bytes = await Promise.all(SIZE_IDS.map((id) => shownBytes(page, id)))
    const smallest = SIZE_IDS[bytes.indexOf(Math.min(...bytes))]
    await expect(page.locator(`.export-sizes [data-format="${smallest}"] .badge`)).toHaveText('smallest')
  })

  test('sizes follow the drawing: more strokes -> bigger RLE JSON and SVG', async ({ page }) => {
    await setBrush(page, 2)
    await stroke(page, [20, 20], [100, 20])
    await openFormats(page)
    const before = { rle: await shownBytes(page, 'json:rle'), svg: await shownBytes(page, 'svg') }
    await stroke(page, [20, 60], [120, 110])
    await colorInput(page).fill('#30a46c')
    await stroke(page, [200, 20], [60, 130])
    await expect.poll(() => shownBytes(page, 'json:rle'), { timeout: 30_000 }).toBeGreaterThan(before.rle)
    await expect.poll(() => shownBytes(page, 'svg'), { timeout: 30_000 }).toBeGreaterThan(before.svg)
  })

  test('sizes are recalculated after reset and after a resolution change', async ({ page }) => {
    await setBrush(page, 3)
    await stroke(page, [20, 20], [200, 100])
    await openFormats(page)
    const drawn = await shownBytes(page, 'json:rle')
    await button(page, 'Reset').click()
    await expect.poll(() => shownBytes(page, 'json:rle')).toBeLessThan(drawn)
    const small = await shownBytes(page, 'png')
    await qualitySelect(page).selectOption('720')
    await expect.poll(() => shownBytes(page, 'png'), { timeout: 30_000 }).not.toBe(small)
  })

  test('an empty canvas: RLE is tiny, Delta+RLE is a single run', async ({ page }) => {
    await openFormats(page)
    expect(await shownBytes(page, 'json:rle')).toBeLessThan(100)
    expect(await shownBytes(page, 'json:delta-rle')).toBeLessThan(200)
  })

  test('shows sizes for a 4K 21:9 canvas without freezing the page', async ({ page }) => {
    test.setTimeout(120_000)
    await openFormats(page)
    await button(page, '21:9').click()
    await qualitySelect(page).selectOption('2160')
    // while it is being measured the page stays responsive: the UI reacts to a click
    await button(page, 'Round').click()
    await expect(button(page, 'Round')).toHaveClass(/active/)
    for (const id of SIZE_IDS) expect(await shownBytes(page, id)).toBeGreaterThan(0)
  })
})

test.describe('AVIF size', () => {
  test('is measured by the WASM encoder and explained to the user', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await setBrush(page, 3)
    await stroke(page, [20, 20], [200, 100])
    await openFormats(page)
    expect(await shownBytes(page, 'avif')).toBeGreaterThan(50)
    await expect(page.locator('.export-sizes')).toContainText('WASM encoder')
    await expect(page.locator('.export-sizes')).toContainText('downloading as AVIF is not implemented')
    expect(errors).toEqual([])
  })

  test('is smaller than PNG and JPG for a drawing', async ({ page }) => {
    await setBrush(page, 5)
    await stroke(page, [20, 20], [200, 100])
    await stroke(page, [30, 120], [220, 30])
    await openFormats(page)
    const avif = await shownBytes(page, 'avif')
    expect(avif).toBeLessThan(await shownBytes(page, 'png'))
    expect(avif).toBeLessThan(await shownBytes(page, 'jpg'))
  })

  test('follows the drawing: empty canvas < drawn canvas', async ({ page }) => {
    await openFormats(page)
    const empty = await shownBytes(page, 'avif')
    await setBrush(page, 4)
    await stroke(page, [20, 20], [200, 100])
    await stroke(page, [30, 120], [220, 30])
    await expect.poll(() => shownBytes(page, 'avif'), { timeout: 30_000 }).toBeGreaterThan(empty)
  })

  test('a big calculation is cancelled when the canvas changes, and the encoder recovers', async ({ page }) => {
    test.setTimeout(120_000)
    await openFormats(page)
    await button(page, '21:9').click()
    await qualitySelect(page).selectOption('2160') // a heavy canvas: AVIF takes several seconds
    await expect(sizeCell(page, 'avif')).toContainText('calculating') // the measurement is running
    await qualitySelect(page).selectOption('72') // change the canvas on the fly — the old measurement is aborted
    const started = Date.now()
    expect(await shownBytes(page, 'avif')).toBeGreaterThan(0)
    expect(Date.now() - started).toBeLessThan(15_000) // we did not wait for the 4K measurement to finish
    expect(await size(canvasOf(page))).toEqual([168, 72])
  })

  test('the page stays responsive while AVIF of a 4K canvas is encoding', async ({ page }) => {
    test.setTimeout(120_000)
    await openFormats(page)
    await button(page, '21:9').click()
    await qualitySelect(page).selectOption('2160')
    await setBrush(page, 40)
    await stroke(page, [200, 200], [4800, 1900])
    // encoding runs in a worker: drawing and clicks keep working
    await expect(sizeCell(page, 'avif')).toContainText('calculating')
    const t0 = Date.now()
    await button(page, 'Round').click()
    await expect(button(page, 'Round')).toHaveClass(/active/)
    expect(Date.now() - t0).toBeLessThan(3000)
    expect(await shownBytes(page, 'avif')).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------------------------
// Colors per format
// ---------------------------------------------------------------------------------------------

const colorsCell = (page: Page, id: string) => page.locator(`.export-sizes [data-format="${id}"] .colors`)
const digits = (text: string | null) => Number((text ?? '').replace(/\D/g, ''))

async function shownColors(page: Page, id: string) {
  await expect(colorsCell(page, id)).toHaveAttribute('data-colors', /^\d+$/, { timeout: 30_000 })
  return Number(await colorsCell(page, id).getAttribute('data-colors'))
}

/** How many colors the canvas has — from the column header "Colors (on canvas: N)". */
async function canvasColors(page: Page) {
  return digits(await page.locator('.export-sizes thead th').nth(2).locator('.muted').textContent())
}

const LOSSLESS = ['png', 'svg', 'json:rle', 'json:delta-rle']

async function drawTwoColors(page: Page) {
  await setBrush(page, 4)
  await stroke(page, [20, 20], [200, 100]) // #e5484d
  await colorInput(page).fill('#0091ff')
  await stroke(page, [30, 120], [220, 30])
}

test.describe('colors per format', () => {
  test('lossless formats keep exactly the canvas colors and say so', async ({ page }) => {
    await drawTwoColors(page)
    await openFormats(page)
    expect(await canvasColors(page)).toBe(2)
    for (const id of LOSSLESS) {
      expect(await shownColors(page, id), id).toBe(2)
      await expect(colorsCell(page, id).locator('.delta')).toHaveText('same as canvas')
      await expect(colorsCell(page, id).locator('.delta')).toHaveClass(/same/)
    }
  })

  test('JPG adds colors (white background + compression shades) and shows the difference', async ({ page }) => {
    await drawTwoColors(page)
    await openFormats(page)
    const jpg = await shownColors(page, 'jpg')
    expect(jpg).toBeGreaterThan(2 + 1) // at the very least: a white background and compression shades
    const badge = colorsCell(page, 'jpg').locator('.delta')
    await expect(badge).toHaveClass(/changed/)
    await expect(badge).toHaveText(/^\+/)
    expect(digits(await badge.textContent())).toBe(jpg - 2)
  })

  test('WEBP and AVIF are decoded back and their colors are measured', async ({ page }) => {
    await drawTwoColors(page)
    await openFormats(page)
    for (const id of ['webp', 'avif']) {
      expect(await shownColors(page, id), id).toBeGreaterThan(0)
      await expect(colorsCell(page, id).locator('.delta')).toBeVisible() // "same as canvas" or ±N
    }
  })

  test('empty canvas: no colors in lossless formats, JPG has one (the white background)', async ({ page }) => {
    await openFormats(page)
    expect(await canvasColors(page)).toBe(0)
    for (const id of LOSSLESS) expect(await shownColors(page, id), id).toBe(0)
    expect(await shownColors(page, 'jpg')).toBe(1)
    await expect(colorsCell(page, 'jpg').locator('.delta')).toHaveText('+1')
  })

  test('a many-color image: lossless formats still match the canvas exactly', async ({ page }) => {
    const stripes: Rect[] = Array.from({ length: 16 }, (_, i) => [
      i * 8, 0, 8, 64, `rgb(${i * 16}, ${255 - i * 16}, ${(i * 37) % 256})`,
    ])
    await importPng(page, await makePng(page, 128, 64, stripes))
    await openFormats(page)
    expect(await canvasColors(page)).toBe(16)
    for (const id of LOSSLESS) expect(await shownColors(page, id), id).toBe(16)
    expect(await shownColors(page, 'jpg')).toBeGreaterThan(16)
  })

  test('colors update when a new color is drawn', async ({ page }) => {
    await setBrush(page, 3)
    await stroke(page, [10, 10], [100, 10])
    await openFormats(page)
    expect(await shownColors(page, 'png')).toBe(1)
    await colorInput(page).fill('#30a46c')
    await stroke(page, [10, 40], [100, 40])
    await expect.poll(() => shownColors(page, 'png'), { timeout: 30_000 }).toBe(2)
    expect(await canvasColors(page)).toBe(2)
  })

  test('colors of a 4K canvas are measured too', async ({ page }) => {
    test.setTimeout(150_000)
    await openFormats(page)
    await button(page, '21:9').click()
    await qualitySelect(page).selectOption('2160')
    await setBrush(page, 40)
    await stroke(page, [200, 200], [4800, 1900])
    for (const id of SIZE_IDS) expect(await shownColors(page, id), id).toBeGreaterThanOrEqual(1)
    for (const id of LOSSLESS) expect(await shownColors(page, id), id).toBe(1)
  })
})

// ---------------------------------------------------------------------------------------------
// Compression level slider (JPG, WEBP, AVIF)
// ---------------------------------------------------------------------------------------------

const qualitySlider = (page: Page) => page.getByLabel('Compression level', { exact: true })

async function setCompression(page: Page, value: number) {
  await qualitySlider(page).evaluate((el: HTMLInputElement, v) => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    set.call(el, String(v))
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }, value)
}

/** A noisy image: for flat-colored drawings the size barely depends on quality. */
async function makeNoisePng(page: Page, w: number, h: number) {
  const bytes = await page.evaluate(
    async ({ w, h }) => {
      const c = document.createElement('canvas')
      c.width = w
      c.height = h
      const ctx = c.getContext('2d')!
      const img = ctx.createImageData(w, h)
      let seed = 12345
      for (let i = 0; i < w * h; i++) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff
        img.data[i * 4] = (i % w) * (255 / w) + ((seed >> 4) & 63)
        img.data[i * 4 + 1] = Math.floor(i / w) * (255 / h) + ((seed >> 10) & 63)
        img.data[i * 4 + 2] = (seed >> 16) & 255
        img.data[i * 4 + 3] = 255
      }
      ctx.putImageData(img, 0, 0)
      const blob = await new Promise<Blob>((res) => c.toBlob((b) => res(b!), 'image/png'))
      return [...new Uint8Array(await blob.arrayBuffer())]
    },
    { w, h },
  )
  return Buffer.from(bytes)
}

const LOSSY = ['jpg', 'webp', 'avif']

test.describe('compression level slider', () => {
  test('is in the sizes block with a 1…100 range and the previous default 95', async ({ page }) => {
    await openFormats(page)
    await expect(qualitySlider(page)).toHaveAttribute('min', '1')
    await expect(qualitySlider(page)).toHaveAttribute('max', '100')
    await expect(qualitySlider(page)).toHaveValue('95')
    await expect(page.getByTestId('quality-value')).toHaveText('95')
  })

  test('the label follows the slider in real time', async ({ page }) => {
    await openFormats(page)
    await setCompression(page, 42)
    await expect(page.getByTestId('quality-value')).toHaveText('42')
    await setCompression(page, 100)
    await expect(page.getByTestId('quality-value')).toHaveText('100')
  })

  test('lower quality -> smaller JPG, WEBP and AVIF; higher -> larger', async ({ page }) => {
    test.setTimeout(90_000)
    await page.getByLabel('Fit mode').selectOption('original')
    await importPng(page, await makeNoisePng(page, 160, 90))
    await openFormats(page)
    const at = async (q: number) => {
      await setCompression(page, q)
      await expect(page.getByTestId('quality-value')).toHaveText(String(q))
      return Promise.all(LOSSY.map((id) => shownBytes(page, id)))
    }
    const low = await at(15)
    const mid = await at(60)
    const high = await at(95)
    LOSSY.forEach((id, i) => {
      expect(low[i], `${id} 15 < 60`).toBeLessThan(mid[i])
      expect(mid[i], `${id} 60 < 95`).toBeLessThan(high[i])
    })
  })

  test('lossless formats are not recalculated when the slider moves', async ({ page }) => {
    await setBrush(page, 4)
    await stroke(page, [20, 20], [200, 100])
    await openFormats(page)
    const before: Record<string, number> = {}
    for (const id of ['png', 'svg', 'json:rle', 'json:delta-rle']) before[id] = await shownBytes(page, id)
    await setCompression(page, 30)
    await page.waitForTimeout(30) // less than the recalculation delay: if they were recalculated they would turn into "calculating…"
    for (const id of Object.keys(before)) {
      await expect(sizeCell(page, id), id).toHaveAttribute('data-bytes', String(before[id]))
      await expect(sizeCell(page, id), id).not.toContainText('calculating…')
    }
    // while the lossy formats are recalculated
    await expect(sizeCell(page, 'jpg')).toHaveAttribute('data-bytes', /^\d+$/, { timeout: 30_000 })
  })

  test('values for an already measured quality come back instantly', async ({ page }) => {
    await page.getByLabel('Fit mode').selectOption('original')
    await importPng(page, await makeNoisePng(page, 128, 72))
    await openFormats(page)
    const at95 = await Promise.all(LOSSY.map((id) => shownBytes(page, id)))
    await setCompression(page, 30)
    for (const id of LOSSY) await shownBytes(page, id)
    await setCompression(page, 95)
    await page.waitForTimeout(30) // earlier than a new measurement could finish
    for (const [i, id] of LOSSY.entries()) {
      await expect(sizeCell(page, id), id).toHaveAttribute('data-bytes', String(at95[i]))
    }
  })

  for (const quality of [100, 60, 20]) {
    test(`shown JPG/WEBP sizes equal the downloaded files at quality ${quality}`, async ({ page }) => {
      await page.getByLabel('Fit mode').selectOption('original')
      await importPng(page, await makeNoisePng(page, 160, 90))
      await openFormats(page)
      await setCompression(page, quality)
      for (const format of ['JPG', 'WEBP'] as const) {
        const expected = await shownBytes(page, format.toLowerCase())
        expect(await fileSize(await download(page, format)), `${format} @${quality}`).toBe(expected)
      }
    })
  }

  test('the download buttons tell which quality they use', async ({ page }) => {
    await openFormats(page)
    await setCompression(page, 73)
    await expect(button(page, 'JPG')).toHaveAttribute('title', 'Compression level: 73')
    await expect(button(page, 'WEBP')).toHaveAttribute('title', 'Compression level: 73')
    await expect(button(page, 'PNG')).not.toHaveAttribute('title', /.+/)
  })

  test('the chosen quality survives drawing (the panel re-renders after every stroke)', async ({ page }) => {
    await openFormats(page)
    await setCompression(page, 40)
    await setBrush(page, 3)
    await stroke(page, [20, 20], [100, 60])
    await stroke(page, [30, 90], [200, 30])
    await expect(page.getByTestId('quality-value')).toHaveText('40')
    await expect(qualitySlider(page)).toHaveValue('40')
    // and the sizes are now measured for 40: they match a file downloaded at the same level
    const expected = await shownBytes(page, 'jpg')
    expect(await fileSize(await download(page, 'JPG'))).toBe(expected)
  })

  test('colors are re-measured with the quality too (JPG artefacts change)', async ({ page }) => {
    await page.getByLabel('Fit mode').selectOption('original')
    await importPng(page, await makeNoisePng(page, 160, 90))
    await openFormats(page)
    await setCompression(page, 100)
    const hi = await shownColors(page, 'jpg')
    await setCompression(page, 10)
    await expect.poll(() => shownColors(page, 'jpg'), { timeout: 30_000 }).not.toBe(hi)
  })
})

// ---------------------------------------------------------------------------------------------
// Layout: settings blocks
// ---------------------------------------------------------------------------------------------

const card = (page: Page, title: string) => page.getByRole('region', { name: title, exact: true })

test.describe('layout: blocks', () => {
  test('the sidebar is split into Canvas, Brush, Import and Download, in that order', async ({ page }) => {
    await expect(page.locator('.sidebar .card > h2')).toHaveText(['Canvas', 'Brush', 'Import', 'Download'])
  })

  test('every control lives in the block it belongs to', async ({ page }) => {
    const canvasCard = card(page, 'Canvas')
    await expect(canvasCard.getByLabel('Quality', { exact: true })).toBeVisible()
    for (const r of ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16']) await expect(canvasCard.getByRole('button', { name: r, exact: true })).toBeVisible()
    await expect(canvasCard.getByRole('button', { name: 'Reset', exact: true })).toBeVisible()

    const brush = card(page, 'Brush')
    await expect(brush.getByLabel('Brush color')).toBeVisible()
    await expect(brush.getByLabel('Brush size')).toBeVisible()
    for (const b of ['Square', 'Round']) await expect(brush.getByRole('button', { name: b })).toBeVisible()

    const imp = card(page, 'Import')
    await expect(imp.getByRole('button', { name: 'Upload…' })).toBeVisible()
    await expect(imp.getByLabel('Fit mode')).toBeVisible()
    await expect(imp.getByLabel('Smoothing')).toBeVisible()
    await expect(imp.getByLabel('Match aspect ratio')).toBeVisible()
    await expect(imp.getByTestId('import-input')).toHaveCount(1)

    const dl = card(page, 'Download')
    for (const f of ['PNG', 'JPG', 'WEBP', 'SVG']) await expect(dl.getByRole('button', { name: f, exact: true })).toBeVisible()
    await expect(dl.getByLabel('JPG & WEBP compression level')).toBeVisible()
    await expect(dl.getByLabel('Export format')).toBeVisible()
    await expect(dl.getByRole('button', { name: 'Download', exact: true })).toBeVisible()

    // and nothing extra is left in other blocks
    await expect(canvasCard.getByLabel('Brush size')).toHaveCount(0)
    await expect(brush.getByRole('button', { name: 'PNG', exact: true })).toHaveCount(0)
    await expect(dl.getByRole('button', { name: 'Reset', exact: true })).toHaveCount(0)
  })

  test('the two information blocks are collapsed by default and render nothing', async ({ page }) => {
    for (const title of [INFO_TITLE, FORMATS_TITLE]) {
      await expect(toggleBlock(page, title)).toHaveAttribute('aria-expanded', 'false')
    }
    await expect(page.locator('.info')).toHaveCount(0)
    await expect(page.locator('.export-sizes')).toHaveCount(0)
  })

  test('the information blocks open and close independently', async ({ page }) => {
    await openInfo(page)
    await expect(page.locator('.info')).toBeVisible()
    await expect(page.locator('.export-sizes')).toHaveCount(0) // the formats block did not open
    await openFormats(page)
    await expect(page.locator('.export-sizes')).toBeVisible()
    await toggleBlock(page, INFO_TITLE).click()
    await expect(page.locator('.info')).toHaveCount(0)
    await expect(page.locator('.export-sizes')).toBeVisible() // the second one stayed open
    await toggleBlock(page, FORMATS_TITLE).click()
    await expect(page.locator('.export-sizes')).toHaveCount(0)
  })

  test('the canvas info block no longer contains format sizes, and the formats block no longer contains pixel tables', async ({ page }) => {
    await setBrush(page, 3)
    await stroke(page, [20, 20], [100, 60])
    await openInfo(page)
    await expect(page.locator('.info')).toContainText('Colors')
    await expect(page.locator('.info')).toContainText('Pixels (rgba)')
    await expect(page.locator('.info .export-sizes')).toHaveCount(0)
    await expect(page.locator('.info')).not.toContainText('PNG')
    await openFormats(page)
    await expect(page.locator('.export-sizes')).toContainText('AVIF')
    await expect(page.locator('.export-sizes .scroll')).toHaveCount(0)
    await expect(page.locator('.export-sizes')).not.toContainText('Pixels (rgba)')
  })

  test('formats are not measured while their block is closed', async ({ page }) => {
    const requests: string[] = []
    page.on('request', (r) => /avif/.test(r.url()) && requests.push(r.url()))
    await setBrush(page, 3)
    await stroke(page, [20, 20], [100, 60])
    await openInfo(page)
    await page.waitForTimeout(800) // comfortably longer than the measurement start delay
    expect(requests).toEqual([]) // the AVIF worker and wasm were not requested
    await openFormats(page)
    expect(await shownBytes(page, 'avif')).toBeGreaterThan(0)
    expect(requests.length).toBeGreaterThan(0)
  })

  test('the compression slider in Download and the one in the formats block are the same setting', async ({ page }) => {
    await openFormats(page)
    const download = card(page, 'Download').getByLabel('JPG & WEBP compression level')
    await expect(download).toHaveValue('95')
    await setCompression(page, 33)
    await expect(download).toHaveValue('33')
    await expect(page.getByTestId('download-quality-value')).toHaveText('33')
    await download.evaluate((el: HTMLInputElement) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, '77')
      el.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await expect(qualitySlider(page)).toHaveValue('77')
    await expect(page.getByTestId('quality-value')).toHaveText('77')
  })

  test('the level chosen in Download is the one used for the sizes and for the file', async ({ page }) => {
    await page.getByLabel('Fit mode').selectOption('original')
    await importPng(page, await makeNoisePng(page, 128, 72))
    await openFormats(page)
    await card(page, 'Download').getByLabel('JPG & WEBP compression level').evaluate((el: HTMLInputElement) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, '30')
      el.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const expected = await shownBytes(page, 'jpg')
    expect(await fileSize(await download(page, 'JPG'))).toBe(expected)
  })

  test('the status line above the canvas shows size and the pixel under the cursor', async ({ page }) => {
    await expect(page.locator('.canvas-area .status')).toContainText('256×144')
  })

  test('an informational notice is not styled as the information panel', async ({ page }) => {
    const custom = JSON.stringify({ width: 10, height: 5, palette: ['#00ff00'], rows: { 2: [[3, 4, 0]] } })
    await importInput(page).setInputFiles({ name: 'c.json', mimeType: 'application/json', buffer: Buffer.from(custom) })
    const notice = page.locator('.notice')
    await expect(notice).toHaveClass(/notice-info/)
    expect(await notice.evaluate((el) => getComputedStyle(el).borderTopWidth)).toBe('0px')
  })
})

test.describe('layout: responsiveness', () => {
  const widths = [1400, 1280, 1024, 961, 960, 800, 600, 390]

  for (const width of widths) {
    test(`no horizontal overflow at ${width}px with every block open`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await openInfo(page)
      await openFormats(page)
      await setBrush(page, 3)
      await stroke(page, [20, 20], [100, 60])
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      expect(overflow, `scrollWidth overflow at ${width}`).toBeLessThanOrEqual(0)
      // every block and table stays inside the window
      const outside = await page.evaluate(() => {
        const vw = document.documentElement.clientWidth
        return [...document.querySelectorAll('.card, .stage, .canvas, .sidebar select, .sidebar button, .sidebar input')]
          .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && (r.right > vw + 0.5 || r.left < -0.5) })
          .map((el) => `${el.tagName.toLowerCase()}.${el.className}`)
      })
      expect(outside).toEqual([])
    })
  }

  test('on a wide screen the sidebar is to the right of the canvas', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    const stage = (await page.locator('.stage').boundingBox())!
    const side = (await page.locator('.sidebar').boundingBox())!
    expect(side.x).toBeGreaterThanOrEqual(stage.x + stage.width)
    expect(Math.abs(side.y - stage.y)).toBeLessThan(40) // they start at about the same height (allowing for the status line)
  })

  test('on a narrow screen the sidebar goes below the canvas', async ({ page }) => {
    await page.setViewportSize({ width: 600, height: 900 })
    const stage = (await page.locator('.stage').boundingBox())!
    const side = (await page.locator('.sidebar').boundingBox())!
    expect(side.y).toBeGreaterThanOrEqual(stage.y + stage.height)
  })

  test('drawing still works on a phone-sized screen', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 })
    const canvas = canvasOf(page)
    await setBrush(page, 3)
    await stroke(page, [20, 20], [200, 100])
    expect(await paintedCount(canvas)).toBeGreaterThan(100)
  })
})
