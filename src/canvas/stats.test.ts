import { describe, expect, it } from 'vitest'
import { createBuffer, packColor, strokeLine, type PixelBuffer } from './pixels'
import { analyze, listPixels, stateToJson } from './stats'

function sample(): PixelBuffer {
  const buf = createBuffer(10, 6)
  const red = { color: packColor('#ff0000'), size: 1, shape: 'square' as const }
  const blue = { ...red, color: packColor('#0000ff') }
  strokeLine(buf, 1, 1, 4, 1, red) // 4 красных
  strokeLine(buf, 8, 4, 8, 5, blue) // 2 синих
  return buf
}

describe('analyze', () => {
  it('reports an empty canvas', () => {
    const s = analyze(createBuffer(4, 3))
    expect(s).toMatchObject({ total: 12, painted: 0, coverage: 0, bbox: null, colors: [] })
  })

  it('counts painted pixels, bbox and colors sorted by popularity', () => {
    const s = analyze(sample())
    expect(s.total).toBe(60)
    expect(s.painted).toBe(6)
    expect(s.coverage).toBeCloseTo(0.1)
    expect(s.bbox).toEqual({ minX: 1, minY: 1, maxX: 8, maxY: 5 })
    expect(s.colors).toEqual([
      { hex: '#ff0000', count: 4 },
      { hex: '#0000ff', count: 2 },
    ])
  })
})

describe('listPixels', () => {
  it('lists painted pixels row by row with rgba', () => {
    const list = listPixels(sample(), 100)
    expect(list.map((p) => [p.x, p.y])).toEqual([
      [1, 1], [2, 1], [3, 1], [4, 1], [8, 4], [8, 5],
    ])
    expect(list[0]).toMatchObject({ hex: '#ff0000', r: 255, g: 0, b: 0, a: 255 })
    expect(list[5]).toMatchObject({ hex: '#0000ff', r: 0, g: 0, b: 255, a: 255 })
  })

  it('respects the limit', () => {
    expect(listPixels(sample(), 3)).toHaveLength(3)
    expect(listPixels(sample(), 0)).toHaveLength(0)
  })
})

describe('stateToJson', () => {
  interface State {
    width: number
    height: number
    painted: number
    palette: string[]
    rows: Record<string, [number, number, number][]>
  }

  function decode(state: State): Map<string, string> {
    const out = new Map<string, string>()
    for (const [y, runs] of Object.entries(state.rows))
      for (const [x, len, idx] of runs)
        for (let i = 0; i < len; i++) out.set(`${x + i},${y}`, state.palette[idx])
    return out
  }

  it('uses runs and a palette', () => {
    const state: State = JSON.parse(stateToJson(sample()))
    expect(state).toEqual({
      width: 10,
      height: 6,
      painted: 6,
      palette: ['#ff0000', '#0000ff'],
      rows: { 1: [[1, 4, 0]], 4: [[8, 1, 1]], 5: [[8, 1, 1]] },
    })
  })

  it('round-trips to exactly the listed pixels', () => {
    const buf = createBuffer(40, 30)
    const colors = ['#ff0000', '#00ff00', '#123456']
    colors.forEach((c, i) =>
      strokeLine(buf, 2 + i * 3, 2, 30, 25 - i * 5, {
        color: packColor(c),
        size: 3,
        shape: 'round',
      }),
    )
    const state: State = JSON.parse(stateToJson(buf))
    const expected = new Map(listPixels(buf, Infinity).map((p) => [`${p.x},${p.y}`, p.hex]))
    expect(decode(state)).toEqual(expected)
    expect(state.painted).toBe(expected.size)
  })

  it('has no rows for an empty canvas', () => {
    expect(JSON.parse(stateToJson(createBuffer(3, 3))).rows).toEqual({})
  })
})
