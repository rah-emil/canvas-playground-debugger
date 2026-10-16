/**
 * Number of unique colors in RGBA data. Fully transparent pixels are not counted
 * (an "empty" canvas pixel is not a color); semi-transparent ones count as separate RGBA colors.
 */
export function countColors(rgba: Uint8ClampedArray): number {
  const px = new Uint32Array(rgba.buffer, rgba.byteOffset, rgba.byteLength >> 2)
  const seen = new Set<number>()
  let prev = -1
  for (let i = 0; i < px.length; i++) {
    const v = px[i]
    // Consecutive identical pixels (fills) are skipped without touching the Set.
    if (v === prev) continue
    prev = v
    if (v >>> 24 !== 0) seen.add(v)
  }
  return seen.size
}

/** Decodes a finished file (png/jpg/webp/avif) back into pixels and counts its colors. */
export async function countBlobColors(blob: Blob): Promise<number> {
  // No color management or alpha premultiplication: we want the values stored in the file.
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
