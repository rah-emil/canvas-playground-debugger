import { encodeAvif, type RawImage } from './avif-core'

export interface AvifRequest extends RawImage {
  id: number
  quality: number
}
export type AvifResponse = { id: number; file: ArrayBuffer } | { id: number; error: string }

self.addEventListener('message', async (e: MessageEvent<AvifRequest>) => {
  const { id, quality, ...image } = e.data
  try {
    const file = await encodeAvif(image, quality)
    self.postMessage({ id, file } satisfies AvifResponse, { transfer: [file] })
  } catch (err) {
    self.postMessage({
      id,
      error: err instanceof Error ? err.message : String(err),
    } satisfies AvifResponse)
  }
})
