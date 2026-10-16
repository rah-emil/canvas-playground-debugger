import { readFile } from 'node:fs/promises'
import { expect, test, type Download, type Locator, type Page } from '@playwright/test'

const canvasOf = (page: Page) => page.locator('canvas.canvas')
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })

async function size(canvas: Locator) {
  return canvas.evaluate((c: HTMLCanvasElement) => [c.width, c.height])
}

/** Закрашенные пиксели (alpha > 0) и цвет в точке — прямо из пикселей <canvas>. */
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

/** Координаты в пикселях холста -> координаты на странице (центр пикселя). */
async function toPage(canvas: Locator, px: number, py: number) {
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

const slider = (page: Page) => page.locator('input[type=range]')
const colorInput = (page: Page) => page.locator('input[type=color]')
const qualitySelect = (page: Page) => page.getByLabel('Качество', { exact: true })

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
    expect(await pixelAt(canvas, 20, 20)).toEqual([229, 72, 77, 255]) // #e5484d по умолчанию
    expect(await pixelAt(canvas, 220, 120)).toEqual([229, 72, 77, 255])
    expect(await pixelAt(canvas, 200, 20)).toEqual([0, 0, 0, 0])
    // линия 1px от (20,20) до (220,120): Брезенхэм даёт max(dx, dy)+1 пикселей
    expect(await paintedCount(canvas)).toBe(201)
  })

  test('brush size changes stroke thickness', async ({ page }) => {
    const canvas = canvasOf(page)
    await setBrush(page, 1)
    await click(page, [50, 50])
    expect(await paintedCount(canvas)).toBe(1)

    await button(page, 'Сбросить').click()
    await setBrush(page, 10)
    await click(page, [50, 50])
    expect(await paintedCount(canvas)).toBe(100)
  })

  test('brush shape: round paints fewer pixels than square', async ({ page }) => {
    const canvas = canvasOf(page)
    await setBrush(page, 5)
    await click(page, [50, 50])
    expect(await paintedCount(canvas)).toBe(25)

    await button(page, 'Сбросить').click()
    await button(page, 'Круг').click()
    await click(page, [50, 50])
    expect(await paintedCount(canvas)).toBe(21)
  })

  test('brush color updates in real time', async ({ page }) => {
    const canvas = canvasOf(page)
    await setBrush(page, 1)
    await colorInput(page).fill('#00ff00')
    await expect(page.locator('.toolbar code')).toHaveText('#00ff00')
    await click(page, [10, 10])
    expect(await pixelAt(canvas, 10, 10)).toEqual([0, 255, 0, 255])
  })

  test('reset clears the canvas and keeps its size', async ({ page }) => {
    const canvas = canvasOf(page)
    await stroke(page, [10, 10], [100, 100])
    expect(await paintedCount(canvas)).toBeGreaterThan(0)
    await button(page, 'Сбросить').click()
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
    await expect(page.locator('.status')).toContainText('x:31 y:40 · пусто')
  })

  test('dragging out of the canvas does not break drawing', async ({ page }) => {
    const canvas = canvasOf(page)
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await setBrush(page, 1)
    const start = await toPage(canvas, 128, 72)
    await page.mouse.move(start.x, start.y)
    await page.mouse.down()
    await page.mouse.move(5, 5, { steps: 5 }) // за пределы холста
    await page.mouse.up()
    expect(errors).toEqual([])
    expect(await paintedCount(canvas)).toBeGreaterThan(50)
    expect(await pixelAt(canvas, 0, 0)).toEqual([229, 72, 77, 255]) // зажато к краю
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
      // отображаемый холст сохраняет пропорции
      const box = (await canvasOf(page).boundingBox())!
      expect(box.width / box.height).toBeCloseTo(w / h, 1)
    })
  }

  test('keeps the drawing when quality changes (scaled proportionally)', async ({ page }) => {
    const canvas = canvasOf(page)
    await setBrush(page, 8)
    await click(page, [64, 36]) // ровно в первой четверти по обеим осям
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
    await qualitySelect(page).selectOption('2160') // макс. кисть = 540
    await setBrush(page, 540)
    await qualitySelect(page).selectOption('72') // макс. кисть = 18
    await click(page, [64, 36])
    // Кисть должна быть не больше ползунка (18×18), а не 540×540, закрашивающая всё.
    expect(await paintedCount(canvas)).toBeLessThanOrEqual(18 * 18)
    await expect(page.getByText(/Размер кисти: 18px/)).toBeVisible()
  })
})

test.describe('info panel', () => {
  test('toggles and describes an empty canvas', async ({ page }) => {
    await expect(page.locator('.info')).toHaveCount(0)
    await button(page, 'Информация').click()
    const info = page.locator('.info')
    await expect(info).toBeVisible()
    await expect(info).toContainText('256×144 (36 864 px)')
    await expect(info).toContainText('0 px (0.00%)')
    await expect(info).toContainText('Холст пуст')
    await button(page, 'Информация').click()
    await expect(page.locator('.info')).toHaveCount(0)
  })

  test('reflects strokes: counts, bbox, colors, pixel list', async ({ page }) => {
    await setBrush(page, 1)
    await stroke(page, [10, 20], [14, 20]) // 5 красных
    await colorInput(page).fill('#0000ff')
    await stroke(page, [30, 40], [30, 41]) // 2 синих
    await button(page, 'Информация').click()
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
    await expect(info).toContainText('Показаны все закрашенные пиксели')
  })

  test('updates after the next stroke and after reset', async ({ page }) => {
    await setBrush(page, 1)
    await button(page, 'Информация').click()
    const info = page.locator('.info')
    await click(page, [5, 5])
    await expect(info).toContainText('1 px')
    await click(page, [6, 5])
    await expect(info).toContainText('2 px')
    await button(page, 'Сбросить').click()
    await expect(info).toContainText('0 px (0.00%)')
  })

  test('truncates the pixel list to 500 rows and says so', async ({ page }) => {
    await setBrush(page, 36) // максимум для 144p: 144 / 4
    await click(page, [100, 70])
    await button(page, 'Информация').click()
    const info = page.locator('.info')
    await expect(info.locator('.tables > div').nth(1).locator('tbody tr')).toHaveCount(500)
    await expect(info).toContainText('Показаны первые 500 из 1 296')
  })

  test('shows new size after resolution change', async ({ page }) => {
    await button(page, 'Информация').click()
    await button(page, '1:1').click()
    await expect(page.locator('.info')).toContainText('144×144 (20 736 px)')
  })

  test('downloads the full state as JSON runs', async ({ page }) => {
    await setBrush(page, 1)
    await stroke(page, [10, 20], [14, 20])
    await button(page, 'Информация').click()
    const dl = await download(page, 'Скачать JSON')
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

    // Рендерим SVG браузером и сравниваем с исходным холстом.
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
        // сравниваем покрытие и цвет закрашенных пикселей
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
// Импорт картинки
// ---------------------------------------------------------------------------------------------

type Rect = [x: number, y: number, w: number, h: number, color: string]

/** PNG из набора прямоугольников на прозрачном фоне; рисуется самим браузером. */
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
    await expect(page.getByLabel('Режим вписывания')).toHaveValue('original')
    await expect(page.getByLabel('Сглаживание')).toBeDisabled()
    await expect(page.getByLabel('Подогнать пропорции')).toBeDisabled()
    await page.getByLabel('Режим вписывания').selectOption('contain')
    await expect(page.getByLabel('Сглаживание')).toBeEnabled()
    await expect(page.getByLabel('Подогнать пропорции')).toBeEnabled()
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
    // холст не менялся
    expect(await size(canvas)).toEqual([1080, 1080])
    // ровно 300×300 пикселей, без масштабирования и размытия
    expect(await paintedCount(canvas)).toBe(300 * 300)
    expect(await pixelAt(canvas, 389, 540)).toEqual([0, 0, 0, 0])
    expect(await pixelAt(canvas, 390, 540)).toEqual([255, 0, 0, 255])
    expect(await pixelAt(canvas, 390 + 149, 540)).toEqual([255, 0, 0, 255])
    expect(await pixelAt(canvas, 390 + 150, 540)).toEqual([0, 0, 255, 255]) // резкая граница
    expect(await pixelAt(canvas, 689, 540)).toEqual([0, 0, 255, 255])
    expect(await pixelAt(canvas, 690, 540)).toEqual([0, 0, 0, 0])
    expect(await pixelAt(canvas, 540, 389)).toEqual([0, 0, 0, 0])
    expect(await pixelAt(canvas, 540, 690)).toEqual([0, 0, 0, 0])
    await button(page, 'Информация').click()
    await expect(page.locator('.info')).toContainText('Уникальных цветов2')
  })

  test('original: every source pixel maps to exactly one canvas pixel', async ({ page }) => {
    const canvas = canvasOf(page)
    // 3 отдельных пикселя в разных местах картинки 20×10 на холсте 256×144 (центр: x=118, y=67)
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
    // 300×200 на 256×144: смещение (-22, -28); пиксель картинки (22, 28) попадает в (0, 0)
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
    await page.getByLabel('Режим вписывания').selectOption('stretch')
    await page.getByLabel('Сглаживание').uncheck()
    await importPng(page, await makePng(page, 4, 4, LEFT_RED_RIGHT_BLUE))
    // пропорции подогнались под 1:1, качество не изменилось
    expect(await size(canvas)).toEqual([144, 144])
    expect(await paintedCount(canvas)).toBe(144 * 144)
    expect(await pixelAt(canvas, 5, 70)).toEqual([255, 0, 0, 255])
    expect(await pixelAt(canvas, 138, 70)).toEqual([0, 0, 255, 255])
  })

  test('without smoothing only the original colors remain', async ({ page }) => {
    await page.getByLabel('Режим вписывания').selectOption('stretch')
    await page.getByLabel('Сглаживание').uncheck()
    await importPng(page, await makePng(page, 4, 4, LEFT_RED_RIGHT_BLUE))
    await button(page, 'Информация').click()
    await expect(page.locator('.info')).toContainText('Уникальных цветов2')
  })

  test('with smoothing, upscaling blends the colors', async ({ page }) => {
    await page.getByLabel('Режим вписывания').selectOption('stretch')
    await importPng(page, await makePng(page, 4, 4, LEFT_RED_RIGHT_BLUE))
    await button(page, 'Информация').click()
    const text = await page.locator('.summary').innerText()
    const colors = Number(/Уникальных цветов\s*(\d+)/.exec(text)![1])
    expect(colors).toBeGreaterThan(2)
  })

  test('contain keeps the aspect ratio and leaves empty bars', async ({ page }) => {
    const canvas = canvasOf(page)
    await page.getByLabel('Режим вписывания').selectOption('contain')
    await page.getByLabel('Подогнать пропорции').uncheck() // остаётся 16:9, 256×144
    await page.getByLabel('Сглаживание').uncheck()
    await importPng(page, await makePng(page, 2, 2, [[0, 0, 2, 2, '#00ff00']])) // квадрат
    expect(await size(canvas)).toEqual([256, 144])
    // квадрат 144×144 по центру: полосы по 56px слева и справа
    expect(await paintedCount(canvas)).toBe(144 * 144)
    expect(await pixelAt(canvas, 10, 70)).toEqual([0, 0, 0, 0])
    expect(await pixelAt(canvas, 128, 70)).toEqual([0, 255, 0, 255])
    expect(await pixelAt(canvas, 250, 70)).toEqual([0, 0, 0, 0])
  })

  test('cover fills the canvas and crops the overflow', async ({ page }) => {
    const canvas = canvasOf(page)
    await page.getByLabel('Режим вписывания').selectOption('cover')
    await page.getByLabel('Подогнать пропорции').uncheck()
    await page.getByLabel('Сглаживание').uncheck()
    await importPng(page, await makePng(page, 2, 2, [[0, 0, 2, 2, '#00ff00']]))
    expect(await paintedCount(canvas)).toBe(256 * 144)
  })

  test('transparent areas of the image stay empty', async ({ page }) => {
    const canvas = canvasOf(page)
    await page.getByLabel('Режим вписывания').selectOption('stretch')
    await page.getByLabel('Сглаживание').uncheck()
    await importPng(page, await makePng(page, 4, 4, [[0, 0, 2, 4, '#ff0000']])) // правая половина прозрачна
    expect(await paintedCount(canvas)).toBe(72 * 144)
    expect(await pixelAt(canvas, 100, 10)).toEqual([0, 0, 0, 0])
  })

  test('matches the canvas ratio to the image', async ({ page }) => {
    await page.getByLabel('Режим вписывания').selectOption('contain')
    await importPng(page, await makePng(page, 90, 160, [[0, 0, 90, 160, '#ff0000']]))
    expect(await size(canvasOf(page))).toEqual([144, 256]) // 9:16 при 144p
    await expect(button(page, '9:16')).toHaveClass(/active/)
  })

  test('replaces the previous drawing and can be exported afterwards', async ({ page }) => {
    const canvas = canvasOf(page)
    await setBrush(page, 1)
    await stroke(page, [10, 10], [100, 10])
    await page.getByLabel('Режим вписывания').selectOption('stretch')
    await page.getByLabel('Подогнать пропорции').uncheck()
    await page.getByLabel('Сглаживание').uncheck()
    await importPng(page, await makePng(page, 2, 2, [[0, 0, 1, 2, '#0000ff']]))
    expect(await paintedCount(canvas)).toBe(128 * 144) // старая линия исчезла
    expect(await pixelAt(canvas, 50, 10)).toEqual([0, 0, 255, 255])
    const dl = await download(page, 'PNG')
    expect(dl.suggestedFilename()).toBe('canvas-256x144.png')
  })

  test('the same file can be imported twice in a row', async ({ page }) => {
    const canvas = canvasOf(page)
    await page.getByLabel('Режим вписывания').selectOption('stretch')
    await page.getByLabel('Подогнать пропорции').uncheck()
    const png = await makePng(page, 2, 2, [[0, 0, 2, 2, '#ff0000']])
    await importPng(page, png)
    await button(page, 'Сбросить').click()
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
    await expect(page.locator('.notice')).toHaveText('Это не изображение')
    expect(await paintedCount(canvasOf(page))).toBe(0)
  })

  test('shows an error for a broken image file', async ({ page }) => {
    await importPng(page, Buffer.from('definitely not a png'), 'broken.png')
    await expect(page.locator('.notice')).toContainText('Не удалось прочитать')
  })

  test('accepts a file dropped onto the canvas area', async ({ page }) => {
    const canvas = canvasOf(page)
    await page.getByLabel('Режим вписывания').selectOption('stretch')
    await page.getByLabel('Подогнать пропорции').uncheck()
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
