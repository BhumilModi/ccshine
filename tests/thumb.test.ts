import { expect, test } from 'claude-code/testing'

import { fromBase64, parseBmp, thumbCells, thumbSize } from '../hooks/thumb'
import { bmp, toBase64 } from './bmp'

const quad = (x: number, y: number) => (y === 0 ? (x === 0 ? 0xff0000 : 0x00ff00) : x === 0 ? 0x0000ff : 0xffffff)

test('parseBmp reads 24-bit bottom-up, 32-bit and top-down pixels', async () => {
  for (const [bits, topDown] of [[24, false], [32, false], [24, true]] as const) {
    const img = parseBmp(bmp(2, 2, quad, bits, topDown))!
    expect([img.width, img.height]).toEqual([2, 2])
    expect([img.pixel(0, 0), img.pixel(1, 0), img.pixel(0, 1), img.pixel(1, 1)]).toEqual([0xff0000, 0x00ff00, 0x0000ff, 0xffffff])
  }
})

test('parseBmp reads the 32-bit BI_BITFIELDS top-down BMP sips writes', async () => {
  const img = parseBmp(bmp(2, 2, quad, 32, true, true))!
  expect([img.pixel(0, 0), img.pixel(1, 1)]).toEqual([0xff0000, 0xffffff])
})

test('parseBmp refuses what is not an uncompressed BMP', async () => {
  expect(parseBmp(new Uint8Array([1, 2, 3]))).toBeNull()
  const png = new Uint8Array(60)
  png[0] = 0x89
  expect(parseBmp(png)).toBeNull()
})

test('thumbSize keeps the picture\'s shape inside the box, two pixels a cell tall', async () => {
  expect(thumbSize(2588, 1098, 40, 12)).toEqual({ cols: 40, rows: 9 })
  expect(thumbSize(100, 1000, 40, 12)).toEqual({ cols: 2, rows: 12 })
  expect(thumbSize(1, 1, 40, 12)).toEqual({ cols: 24, rows: 12 })
})

test('thumbCells draws each cell as an upper half block: top pixel over bottom pixel', async () => {
  const img = parseBmp(bmp(2, 4, (x, y) => (y % 2 === 0 ? 0x111111 * (x + 1) : 0xabcdef)))!
  const words = thumbCells(img, 2, 2)
  expect(words.length).toBe(2 * 2 * 3)
  expect([...words.slice(0, 3)]).toEqual([0x2580, 0x111111, 0xabcdef])
  expect([...words.slice(3, 6)]).toEqual([0x2580, 0x222222, 0xabcdef])
})

test('fromBase64 gives back the bytes', async () => {
  const b = bmp(3, 2, (x, y) => x * 0x10 + y)
  expect([...fromBase64(toBase64(b))]).toEqual([...b])
})
