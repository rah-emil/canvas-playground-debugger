import type { Ratio } from './config'
import { createBuffer, type PixelBuffer, type Rect } from './pixels'

export type FitMode = 'original' | 'contain' | 'cover' | 'stretch'

export const FIT_MODES: readonly { value: FitMode; label: string }[] = [
  { value: 'original', label: 'Оригинал (пиксель в пиксель)' },
  { value: 'contain', label: 'Вписать' },
  { value: 'cover', label: 'Заполнить (обрезать)' },
  { value: 'stretch', label: 'Растянуть' },
]

export interface ImportOptions {
  fit: FitMode
  /** Сглаживание при масштабировании; для пиксель-арта лучше выключить. В режиме «original» не нужно. */
  smooth: boolean
}

/** Куда рисовать картинку srcW×srcH на холсте dstW×dstH (целые координаты). */
export function fitRect(
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
  mode: FitMode,
): Rect {
  if (mode === 'stretch') return { x: 0, y: 0, w: dstW, h: dstH }
  // Без масштабирования: по центру; если картинка больше холста, обрезается симметрично.
  if (mode === 'original') {
    return {
      x: Math.floor((dstW - srcW) / 2),
      y: Math.floor((dstH - srcH) / 2),
      w: srcW,
      h: srcH,
    }
  }
  const scale =
    mode === 'contain' ? Math.min(dstW / srcW, dstH / srcH) : Math.max(dstW / srcW, dstH / srcH)
  const w = Math.max(1, Math.round(srcW * scale))
  const h = Math.max(1, Math.round(srcH * scale))
  return { x: Math.round((dstW - w) / 2), y: Math.round((dstH - h) / 2), w, h }
}

/** Ближайшее по пропорциям соотношение сторон из списка (по логарифму отношения). */
export function closestRatio(srcW: number, srcH: number, ratios: readonly Ratio[]): Ratio {
  const target = Math.log(srcW / srcH)
  return ratios.reduce((best, r) =>
    Math.abs(Math.log(r.w / r.h) - target) < Math.abs(Math.log(best.w / best.h) - target)
      ? r
      : best,
  )
}

/**
 * Переносит RGBA в буфер холста. Пиксель либо закрашен (alpha >= 128, становится непрозрачным),
 * либо пуст: полупрозрачность холст не хранит.
 */
export function rgbaToBuffer(rgba: Uint8ClampedArray, width: number, height: number): PixelBuffer {
  const buf = createBuffer(width, height)
  const out = buf.image.data
  for (let i = 0; i < width * height * 4; i += 4) {
    if (rgba[i + 3] < 128) continue
    out[i] = rgba[i]
    out[i + 1] = rgba[i + 1]
    out[i + 2] = rgba[i + 2]
    out[i + 3] = 255
  }
  return buf
}

/** Переносит готовый буфер на холст другого размера: по центру, без масштабирования, лишнее обрезается. */
export function placeCentered(src: PixelBuffer, width: number, height: number): PixelBuffer {
  const dst = createBuffer(width, height)
  const r = fitRect(src.width, src.height, width, height, 'original')
  for (let sy = 0; sy < src.height; sy++) {
    const dy = r.y + sy
    if (dy < 0 || dy >= height) continue
    for (let sx = 0; sx < src.width; sx++) {
      const dx = r.x + sx
      if (dx >= 0 && dx < width) dst.data32[dy * width + dx] = src.data32[sy * src.width + sx]
    }
  }
  return dst
}

async function loadImage(file: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    return img
  } catch {
    throw new Error('Не удалось прочитать файл как изображение')
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function readImageSize(file: Blob) {
  const img = await loadImage(file)
  return { width: img.naturalWidth, height: img.naturalHeight }
}

export async function importImage(
  file: Blob,
  width: number,
  height: number,
  { fit, smooth }: ImportOptions,
): Promise<PixelBuffer> {
  const img = await loadImage(file)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.imageSmoothingEnabled = smooth && fit !== 'original'
  ctx.imageSmoothingQuality = 'high'
  const r = fitRect(img.naturalWidth, img.naturalHeight, width, height, fit)
  ctx.drawImage(img, r.x, r.y, r.w, r.h)
  return rgbaToBuffer(ctx.getImageData(0, 0, width, height).data, width, height)
}
