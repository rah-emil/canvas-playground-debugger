/// <reference types="node" />
import { readFile } from 'node:fs/promises'
import { init } from '@jsquash/avif/encode'
import { beforeAll, describe, expect, it } from 'vitest'
import { encodeAvif, toRawImage } from './avif-core'
import { createBuffer, packColor, strokeLine } from './pixels'

const ascii = (bytes: Uint8Array, from: number, to: number) =>
  String.fromCharCode(...bytes.subarray(from, to))

function drawing(width: number, height: number) {
  const buf = createBuffer(width, height)
  strokeLine(buf, 2, 2, width - 3, height - 3, { color: packColor('#e5484d'), size: 4, shape: 'round' })
  strokeLine(buf, 2, height - 3, width - 3, 2, { color: packColor('#0091ff'), size: 3, shape: 'square' })
  return buf
}

describe('AVIF size estimation', () => {
  // In a browser the encoder loads its .wasm itself; node has no fetch for file:// — hand it a ready module.
  beforeAll(async () => {
    const wasm = await readFile(
      new URL('../../node_modules/@jsquash/avif/codec/enc/avif_enc.wasm', import.meta.url),
    )
    await init(await WebAssembly.compile(wasm))
  }, 30_000)

  it('produces a valid AVIF file (ISO BMFF "ftyp" box with the avif brand)', async () => {
    const file = new Uint8Array(await encodeAvif(toRawImage(drawing(64, 36))))
    expect(file.length).toBeGreaterThan(50)
    expect(ascii(file, 4, 8)).toBe('ftyp')
    expect(ascii(file, 8, 12)).toBe('avif')
  }, 30_000)

  it('does not modify or detach the canvas buffer', async () => {
    const buf = drawing(32, 18)
    const before = buf.data32.slice()
    await encodeAvif(toRawImage(buf))
    expect(buf.data32.length).toBe(32 * 18)
    expect(buf.data32).toEqual(before)
  }, 30_000)

  it('a lower quality gives a smaller file, a higher one a larger file', async () => {
    // A gradient with noise: for flat-colored drawings the size barely depends on quality.
    const buf = createBuffer(96, 64)
    let seed = 7
    for (let y = 0; y < 64; y++)
      for (let x = 0; x < 96; x++) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff
        buf.data32[y * 96 + x] = packColor(
          `#${(x * 2).toString(16).padStart(2, '0')}${(y * 3).toString(16).padStart(2, '0')}${((seed >> 8) & 255).toString(16).padStart(2, '0')}`,
        )
      }
    const size = async (q: number) => (await encodeAvif(toRawImage(buf), q)).byteLength
    const [low, mid, high] = [await size(10), await size(60), await size(95)]
    expect(low).toBeLessThan(mid)
    expect(mid).toBeLessThan(high)
  }, 60_000)

  it('an empty canvas is tiny, a busy one is larger', async () => {
    const empty = (await encodeAvif(toRawImage(createBuffer(128, 72)))).byteLength
    const busy = (await encodeAvif(toRawImage(drawing(128, 72)))).byteLength
    expect(empty).toBeLessThan(busy)
    expect(empty).toBeLessThan(2000)
  }, 30_000)
})
