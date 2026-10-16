import { describe, expect, it } from 'vitest'
import { QUALITIES, RATIOS, getSize } from './config'

const ratio = (label: string) => RATIOS.find((r) => r.label === label)!

describe('getSize', () => {
  it.each([
    [1080, '16:9', 1920, 1080],
    [2160, '21:9', 5040, 2160],
    [1080, '4:3', 1440, 1080],
    [1080, '1:1', 1080, 1080],
    [1080, '3:4', 1080, 1440],
    [1080, '9:16', 1080, 1920],
    [72, '16:9', 128, 72],
    [72, '9:16', 72, 128],
  ])('quality %i at %s -> %ix%i', (q, r, width, height) => {
    expect(getSize(q, ratio(r))).toEqual({ width, height })
  })

  it('quality is always the shorter side, aspect is kept within rounding', () => {
    for (const q of QUALITIES) {
      for (const r of RATIOS) {
        const { width, height } = getSize(q.value, r)
        expect(Math.min(width, height)).toBe(q.value)
        expect(Math.abs(width / height - r.w / r.h)).toBeLessThan(0.02)
      }
    }
  })
})
