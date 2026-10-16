import { describe, expect, it } from 'vitest'
import { countColors } from './colors'

const rgba = (...pixels: [number, number, number, number][]) =>
  new Uint8ClampedArray(pixels.flat())

describe('countColors', () => {
  it('counts distinct opaque colors', () => {
    expect(countColors(rgba([255, 0, 0, 255], [0, 255, 0, 255], [255, 0, 0, 255]))).toBe(2)
  })

  it('does not count fully transparent pixels, whatever their rgb is', () => {
    expect(countColors(rgba([0, 0, 0, 0], [9, 9, 9, 0], [255, 0, 0, 255]))).toBe(1)
    expect(countColors(rgba([0, 0, 0, 0], [0, 0, 0, 0]))).toBe(0)
  })

  it('treats the same rgb with different alpha as different colors', () => {
    expect(countColors(rgba([10, 20, 30, 255], [10, 20, 30, 128], [10, 20, 30, 1]))).toBe(3)
  })

  it('counts non-adjacent repeats once and works on a view with an offset', () => {
    const base = new Uint8ClampedArray(
      [0, 0, 0, 0, 1, 2, 3, 255, 4, 5, 6, 255, 1, 2, 3, 255, 4, 5, 6, 255],
    )
    expect(countColors(base)).toBe(2)
    expect(countColors(base.subarray(4))).toBe(2) // shifted by one pixel: the bytes are 4-aligned
  })

  it('handles an empty array', () => {
    expect(countColors(new Uint8ClampedArray(0))).toBe(0)
  })

  it('counts 256 distinct shades of a gradient', () => {
    const data = new Uint8ClampedArray(256 * 4)
    for (let i = 0; i < 256; i++) data.set([i, 0, 0, 255], i * 4)
    expect(countColors(data)).toBe(256)
  })
})
