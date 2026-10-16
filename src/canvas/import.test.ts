import { describe, expect, it } from 'vitest'
import { RATIOS } from './config'
import { closestRatio, fitRect, rgbaToBuffer } from './import'
import { toHex } from './pixels'

describe('fitRect', () => {
  it('original: keeps the size and centers the image', () => {
    expect(fitRect(300, 300, 1080, 1080, 'original')).toEqual({ x: 390, y: 390, w: 300, h: 300 })
    expect(fitRect(64, 32, 256, 144, 'original')).toEqual({ x: 96, y: 56, w: 64, h: 32 })
  })

  it('original: odd leftover space rounds the offset down', () => {
    expect(fitRect(301, 301, 1080, 1080, 'original')).toEqual({ x: 389, y: 389, w: 301, h: 301 })
  })

  it('original: an image larger than the canvas is cropped symmetrically', () => {
    expect(fitRect(300, 200, 256, 144, 'original')).toEqual({ x: -22, y: -28, w: 300, h: 200 })
  })

  it('contain: letterboxes a wide image on a square canvas', () => {
    expect(fitRect(200, 100, 100, 100, 'contain')).toEqual({ x: 0, y: 25, w: 100, h: 50 })
  })

  it('contain: pillarboxes a tall image on a wide canvas', () => {
    expect(fitRect(100, 200, 160, 90, 'contain')).toEqual({ x: 58, y: 0, w: 45, h: 90 })
  })

  it('cover: overflows the canvas symmetrically', () => {
    expect(fitRect(200, 100, 100, 100, 'cover')).toEqual({ x: -50, y: 0, w: 200, h: 100 })
  })

  it('stretch: fills the canvas exactly', () => {
    expect(fitRect(13, 7, 256, 144, 'stretch')).toEqual({ x: 0, y: 0, w: 256, h: 144 })
  })

  it('upscales small images (pixel art) and never produces an empty rect', () => {
    expect(fitRect(16, 16, 144, 144, 'contain')).toEqual({ x: 0, y: 0, w: 144, h: 144 })
    const r = fitRect(1, 5000, 100, 100, 'contain')
    expect(r.w).toBeGreaterThanOrEqual(1)
    expect(r.h).toBe(100)
  })
})

describe('closestRatio', () => {
  it.each([
    [1920, 1080, '16:9'],
    [1000, 1000, '1:1'],
    [800, 600, '4:3'],
    [600, 800, '3:4'],
    [1080, 1920, '9:16'],
    [2560, 1080, '21:9'],
    [1000, 700, '4:3'], // 1.43 ближе к 4:3, чем к 1:1 или 16:9
  ])('%i×%i -> %s', (w, h, label) => {
    expect(closestRatio(w, h, RATIOS).label).toBe(label)
  })
})

describe('rgbaToBuffer', () => {
  it('keeps opaque pixels, drops transparent ones, thresholds alpha at 128', () => {
    // 4 пикселя: непрозрачный, прозрачный, alpha=127, alpha=128
    const rgba = new Uint8ClampedArray([
      255, 0, 0, 255, //
      0, 255, 0, 0, //
      0, 0, 255, 127, //
      16, 32, 48, 128,
    ])
    const buf = rgbaToBuffer(rgba, 4, 1)
    expect(buf.data32[0] >>> 24).toBe(255)
    expect(toHex(buf.data32[0])).toBe('#ff0000')
    expect(buf.data32[1]).toBe(0)
    expect(buf.data32[2]).toBe(0)
    expect(toHex(buf.data32[3])).toBe('#102030')
    expect(buf.data32[3] >>> 24).toBe(255) // полупрозрачный становится непрозрачным
  })

  it('does not store color for transparent pixels', () => {
    const buf = rgbaToBuffer(new Uint8ClampedArray([9, 9, 9, 0]), 1, 1)
    expect(buf.data32[0]).toBe(0)
  })
})
