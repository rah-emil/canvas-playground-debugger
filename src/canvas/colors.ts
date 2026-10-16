/**
 * Число уникальных цветов в RGBA-данных. Полностью прозрачные пиксели не считаются
 * (у холста «пусто» — это не цвет); полупрозрачные считаются отдельными цветами по RGBA.
 */
export function countColors(rgba: Uint8ClampedArray): number {
  const px = new Uint32Array(rgba.buffer, rgba.byteOffset, rgba.byteLength >> 2)
  const seen = new Set<number>()
  let prev = -1
  for (let i = 0; i < px.length; i++) {
    const v = px[i]
    // Подряд идущие одинаковые пиксели (заливки) пропускаем без обращения к Set.
    if (v === prev) continue
    prev = v
    if (v >>> 24 !== 0) seen.add(v)
  }
  return seen.size
}

/** Декодирует готовый файл (png/jpg/webp/avif) обратно в пиксели и считает в нём цвета. */
export async function countBlobColors(blob: Blob): Promise<number> {
  // Без цветокоррекции и предумножения альфы: нужны значения, которые лежат в файле.
  const bitmap = await createImageBitmap(blob, {
    premultiplyAlpha: 'none',
    colorSpaceConversion: 'none',
  })
  try {
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!
    ctx.drawImage(bitmap, 0, 0)
    return countColors(ctx.getImageData(0, 0, canvas.width, canvas.height).data)
  } finally {
    bitmap.close()
  }
}
