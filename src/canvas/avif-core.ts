import encode from '@jsquash/avif/encode'
import type { PixelBuffer } from './pixels'
import { DEFAULT_LOSSY_QUALITY } from './quality'

/**
 * AVIF size-estimation settings. Browsers cannot encode AVIF themselves (canvas.toBlob returns PNG),
 * so the libavif WASM encoder is used. The quality comes from outside (the shared 1…100 slider;
 * AVIF has its own scale, so equal numbers for JPG/WEBP/AVIF do not mean equal visual quality),
 * 4:4:4 keeps colored edges of pixel art from being blurred.
 */
export const AVIF_OPTIONS = {
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
  // A copy: the data is transferred to the worker, while the canvas buffer itself must stay in place.
  return {
    data: buf.image.data.slice() as Uint8ClampedArray<ArrayBuffer>,
    width: buf.width,
    height: buf.height,
  }
}

/** Encodes RGBA as AVIF and returns the finished file. */
export async function encodeAvif(
  { data, width, height }: RawImage,
  quality: number = DEFAULT_LOSSY_QUALITY,
): Promise<ArrayBuffer> {
  return encode({ data, width, height } as unknown as ImageData, { ...AVIF_OPTIONS, quality })
}
