import type { AvifRequest, AvifResponse } from './avif.worker'
import { toRawImage } from './avif-core'
import type { PixelBuffer } from './pixels'

interface Pending {
  resolve: (file: ArrayBuffer) => void
  reject: (reason: Error) => void
}

let worker: Worker | null = null
let nextId = 0
const pending = new Map<number, Pending>()

function stopWorker(reason: Error) {
  worker?.terminate()
  worker = null
  for (const p of pending.values()) p.reject(reason)
  pending.clear()
}

function getWorker(): Worker {
  if (worker) return worker
  const w = new Worker(new URL('./avif.worker.ts', import.meta.url), { type: 'module' })
  w.addEventListener('message', (e: MessageEvent<AvifResponse>) => {
    const p = pending.get(e.data.id)
    if (!p) return
    pending.delete(e.data.id)
    if ('error' in e.data) p.reject(new Error(e.data.error))
    else p.resolve(e.data.file)
  })
  w.addEventListener('error', () => stopWorker(new Error('The AVIF encoder failed to start')))
  worker = w
  return w
}

/**
 * The canvas encoded as AVIF (the finished file). Encoding runs in a worker and does not block the page;
 * on abort the worker is stopped (a stale calculation must not hold up the queue).
 */
export function encodeAvifFile(
  buf: PixelBuffer,
  quality: number,
  signal?: AbortSignal,
): Promise<ArrayBuffer> {
  if (signal?.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'))
  const id = nextId++
  const { data, width, height } = toRawImage(buf)
  const w = getWorker()

  return new Promise<ArrayBuffer>((resolve, reject) => {
    // Stop the worker only if this task has not finished yet: otherwise aborting an already
    // measured size would needlessly kill an idle worker together with its loaded wasm.
    const onAbort = () => {
      if (pending.has(id)) stopWorker(new DOMException('Aborted', 'AbortError'))
    }
    const cleanup = () => signal?.removeEventListener('abort', onAbort)
    pending.set(id, {
      resolve: (file) => (cleanup(), resolve(file)),
      reject: (reason) => (cleanup(), reject(reason)),
    })
    signal?.addEventListener('abort', onAbort, { once: true })
    w.postMessage({ id, quality, data, width, height } satisfies AvifRequest, [data.buffer])
  })
}
