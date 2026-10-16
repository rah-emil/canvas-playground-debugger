import encode from '@jsquash/avif/encode'
import type { PixelBuffer } from './pixels'

/**
 * Параметры оценки размера AVIF. Браузеры не умеют кодировать AVIF сами (canvas.toBlob отдаёт PNG),
 * поэтому используется WASM-кодировщик libavif. Качество 90 — ближайший аналог JPG/WEBP с 0.95,
 * 4:4:4 — чтобы не размывать цветные края у пиксель-арта.
 */
export const AVIF_OPTIONS = {
  quality: 90,
  qualityAlpha: -1,
  subsample: 3,
  speed: 6,
} as const

export interface RawImage {
  data: Uint8ClampedArray<ArrayBuffer>
  width: number
  height: number
}

export function toRawImage(buf: PixelBuffer): RawImage {
  // Копия: данные уходят в воркер как transferable, а исходный буфер холста должен остаться на месте.
  return {
    data: buf.image.data.slice() as Uint8ClampedArray<ArrayBuffer>,
    width: buf.width,
    height: buf.height,
  }
}

/** Кодирует RGBA в AVIF и возвращает готовый файл. */
export async function encodeAvif({ data, width, height }: RawImage): Promise<ArrayBuffer> {
  return encode({ data, width, height } as unknown as ImageData, AVIF_OPTIONS)
}
