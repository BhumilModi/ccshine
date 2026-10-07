// An uncompressed BMP of `w`×`h`, pixel (x, y) coloured by `color`; bottom-up unless `topDown`.
export function bmp(w: number, h: number, color: (x: number, y: number) => number, bits: 24 | 32 = 24, topDown = false, bitfields = false): Uint8Array {
  const bpp = bits / 8
  const stride = Math.ceil((w * bpp) / 4) * 4
  const size = 54 + stride * h
  const b = new Uint8Array(size)
  const v = new DataView(b.buffer)
  b[0] = 0x42; b[1] = 0x4d
  v.setUint32(2, size, true); v.setUint32(10, 54, true); v.setUint32(14, 40, true)
  v.setInt32(18, w, true); v.setInt32(22, topDown ? -h : h, true)
  v.setUint16(26, 1, true); v.setUint16(28, bits, true)
  if (bitfields) v.setUint32(30, 3, true)
  for (let y = 0; y < h; y++) {
    const row = topDown ? y : h - 1 - y
    for (let x = 0; x < w; x++) {
      const c = color(x, y)
      const at = 54 + row * stride + x * bpp
      b[at] = c & 0xff; b[at + 1] = (c >> 8) & 0xff; b[at + 2] = (c >> 16) & 0xff
    }
  }
  return b
}


// Standard base64 of bytes, as $.fs.read returns them.
export const toBase64 = (b: Uint8Array) => btoa(Array.from(b, c => String.fromCharCode(c)).join(''))
