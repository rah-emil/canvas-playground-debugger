import { useEffect, useRef, useState } from 'react'
import type { PixelBuffer } from '../canvas/pixels'
import { SIZE_TARGETS, type Measurement, type SizeTarget } from '../canvas/sizes'

export type SizeState =
  | { status: 'pending' }
  | ({ status: 'done' } & Measurement)
  | { status: 'error'; message: string }

const START_DELAY_MS = 150

const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

/** The size of lossy formats depends on the compression level, the others' does not, so their key has no level. */
const cacheKey = (target: SizeTarget, quality: number) =>
  target.lossy ? `${target.id}@${quality}` : target.id

/**
 * Canvas sizes in every export format. They are measured one after another with a small delay,
 * so a big canvas does not freeze the UI and quick strokes or slider moves do not cause wasted work.
 * Already measured values are not recalculated: when the compression level changes only the lossy
 * formats are measured again, and values measured earlier for a level come back instantly.
 */
export function useExportSizes(buffer: PixelBuffer, quality: number): Record<string, SizeState> {
  // Results are tied to the buffer they were measured for: a new buffer starts "calculating" again.
  const [result, setResult] = useState<{
    buffer: PixelBuffer | null
    sizes: Record<string, SizeState>
  }>({ buffer: null, sizes: {} })
  // What is already measured for the current buffer (a synchronous mirror of result, to avoid measuring twice).
  const done = useRef<{ buffer: PixelBuffer | null; keys: Set<string> }>({
    buffer: null,
    keys: new Set(),
  })

  useEffect(() => {
    if (done.current.buffer !== buffer) done.current = { buffer, keys: new Set() }
    let cancelled = false
    const abort = new AbortController()

    const run = async () => {
      for (const target of SIZE_TARGETS) {
        const key = cacheKey(target, quality)
        if (done.current.keys.has(key)) continue
        await nextTask()
        if (cancelled) return
        let state: SizeState
        try {
          state = {
            status: 'done',
            ...(await target.measure(buffer, { quality, signal: abort.signal })),
          }
        } catch (e) {
          state = { status: 'error', message: e instanceof Error ? e.message : String(e) }
        }
        if (cancelled) return
        done.current.keys.add(key)
        setResult((prev) => ({
          buffer,
          sizes: { ...(prev.buffer === buffer ? prev.sizes : {}), [key]: state },
        }))
      }
    }

    const timer = setTimeout(run, START_DELAY_MS)
    return () => {
      cancelled = true
      abort.abort()
      clearTimeout(timer)
    }
  }, [buffer, quality])

  const current = result.buffer === buffer ? result.sizes : {}
  return Object.fromEntries(
    SIZE_TARGETS.map((t) => [t.id, current[cacheKey(t, quality)] ?? { status: 'pending' as const }]),
  )
}
