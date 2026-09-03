import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { deflateSync } from 'node:zlib'

const size = 256

function distanceToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1
  const dy = y2 - y1
  const lengthSquared = dx * dx + dy * dy
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSquared))
  const cx = x1 + t * dx
  const cy = y1 + t * dy
  return Math.hypot(px - cx, py - cy)
}

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type)
  const result = Buffer.alloc(12 + data.length)
  result.writeUInt32BE(data.length, 0)
  typeBuffer.copy(result, 4)
  data.copy(result, 8)
  result.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 8 + data.length)
  return result
}

function createPng() {
  const rows = []
  for (let y = 0; y < size; y += 1) {
    const row = Buffer.alloc(1 + size * 4)
    for (let x = 0; x < size; x += 1) {
      const distanceX = Math.max(48 - x, 0, x - 207, 0)
      const distanceY = Math.max(48 - y, 0, y - 207, 0)
      const inRoundedSquare = distanceX * distanceX + distanceY * distanceY <= 48 * 48
      const offset = 1 + (y * size + x) * 4
      const progress = (x + y) / (size * 2)
      let red = Math.round(93 + (131 - 93) * progress)
      let green = Math.round(140 + (108 - 140) * progress)
      let blue = Math.round(255 + (255 - 255) * progress)
      let alpha = inRoundedSquare ? 255 : 0

      const whiteStroke = [
        [56, 196, 56, 60], [56, 60, 88, 60], [88, 60, 128, 124],
        [128, 124, 168, 60], [168, 60, 200, 60], [200, 60, 200, 196]
      ].some(([x1, y1, x2, y2]) => distanceToSegment(x, y, x1, y1, x2, y2) <= 11)
      if (whiteStroke) {
        red = 255
        green = 255
        blue = 255
        alpha = 255
      }

      row[offset] = red
      row[offset + 1] = green
      row[offset + 2] = blue
      row[offset + 3] = alpha
    }
    rows.push(row)
  }

  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header[8] = 8
  header[9] = 6
  header[10] = 0
  header[11] = 0
  header[12] = 0
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(Buffer.concat(rows))),
    pngChunk('IEND', Buffer.alloc(0))
  ])
}

function createIco(png) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(1, 4)

  const entry = Buffer.alloc(16)
  entry[0] = 0
  entry[1] = 0
  entry[2] = 0
  entry[3] = 0
  entry.writeUInt16LE(1, 4)
  entry.writeUInt16LE(32, 6)
  entry.writeUInt32LE(png.length, 8)
  entry.writeUInt32LE(22, 12)
  return Buffer.concat([header, entry, png])
}

const output = resolve('build/icon.ico')
await mkdir(dirname(output), { recursive: true })
await writeFile(output, createIco(createPng()))
console.log(`Generated ${output}`)
