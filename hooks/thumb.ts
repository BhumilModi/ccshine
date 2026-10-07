// Image thumbnails drawn in the terminal: no terminal here shows pixels, so each cell is an upper half block (▀)
// whose foreground is the top pixel and background the bottom one. The mod cannot inflate a PNG, so the caller has
// macOS `sips` shrink the image to an uncompressed BMP first; this reads that BMP.

export type Picture = { width: number; height: number; pixel: (x: number, y: number) => number }

// An uncompressed 24- or 32-bit BMP (BI_RGB), bottom-up or top-down; null for anything else.
export function parseBmp(b: Uint8Array): Picture | null {
  if (b.length < 54 || b[0] !== 0x42 || b[1] !== 0x4d) return null
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength)
  const offset = v.getUint32(10, true)
  const width = v.getInt32(18, true)
  const signed = v.getInt32(22, true)
  const bits = v.getUint16(28, true)
  const compression = v.getUint32(30, true)
  // BI_BITFIELDS (3) on a 32-bit BMP keeps the BGRA layout sips writes.
  if (width <= 0 || signed === 0 || (bits !== 24 && bits !== 32) || (compression !== 0 && !(compression === 3 && bits === 32))) return null
  const height = Math.abs(signed)
  const bpp = bits / 8
  const stride = Math.ceil((width * bpp) / 4) * 4
  if (offset + stride * height > b.length) return null
  const topDown = signed < 0
  return {
    width,
    height,
    pixel: (x, y) => {
      const at = offset + (topDown ? y : height - 1 - y) * stride + x * bpp
      return (b[at + 2]! << 16) | (b[at + 1]! << 8) | b[at]!
    },
  }
}

// Cells for a `w`×`h` picture inside `maxCols`×`maxRows`, keeping its shape: a cell is one pixel wide and two tall.
export function thumbSize(w: number, h: number, maxCols: number, maxRows: number): { cols: number; rows: number } {
  const scale = Math.min(maxCols / w, (maxRows * 2) / h)
  return { cols: Math.max(1, Math.round(w * scale)), rows: Math.max(1, Math.ceil((h * scale) / 2)) }
}

const UPPER_HALF = 0x2580

// Raster words for a picture already sized `cols`×`rows*2` pixels: [▀, top, bottom] per cell, row-major.
export function thumbCells(p: Picture, cols: number, rows: number): Uint32Array {
  const words = new Uint32Array(cols * rows * 3)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const at = (r * cols + c) * 3
      const x = Math.min(c, p.width - 1)
      words[at] = UPPER_HALF
      words[at + 1] = p.pixel(x, Math.min(r * 2, p.height - 1))
      words[at + 2] = p.pixel(x, Math.min(r * 2 + 1, p.height - 1))
    }
  }
  return words
}

// Bytes from standard base64 (what $.fs.read gives for { as: 'bytes' }).
export function fromBase64(s: string): Uint8Array {
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
