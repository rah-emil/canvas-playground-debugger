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
  // В браузере кодировщик сам грузит .wasm; в node нет fetch для file:// — отдаём готовый модуль.
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

  it('an empty canvas is tiny, a busy one is larger', async () => {
    const empty = (await encodeAvif(toRawImage(createBuffer(128, 72)))).byteLength
    const busy = (await encodeAvif(toRawImage(drawing(128, 72)))).byteLength
    expect(empty).toBeLessThan(busy)
    expect(empty).toBeLessThan(2000)
  }, 30_000)
})
