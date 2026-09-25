import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { deflateSync } from 'node:zlib'

const size = 256
const pixels = Buffer.alloc((size * 4 + 1) * size)

function insideRoundedSquare(x, y, inset, radius) {
  const left = inset
  const top = inset
  const right = size - inset - 1
  const bottom = size - inset - 1
  if (x < left || x > right || y < top || y > bottom) return false
  const cornerX = x < left + radius ? left + radius : x > right - radius ? right - radius : x
  const cornerY = y < top + radius ? top + radius : y > bottom - radius ? bottom - radius : y
  return (x - cornerX) ** 2 + (y - cornerY) ** 2 <= radius ** 2
}

function inCircle(x, y, centerX, centerY, radius) {
  return (x - centerX) ** 2 + (y - centerY) ** 2 <= radius ** 2
}

function colorAt(x, y) {
  if (!insideRoundedSquare(x, y, 8, 46)) return [0, 0, 0, 0]

  let color = [27, 35, 48, 255]
  const onVertical = x >= 82 && x <= 94 && y >= 60 && y <= 196
  const onUpperBranch = y >= 70 && y <= 82 && x >= 88 && x <= 166
  const onMiddleBranch = y >= 122 && y <= 134 && x >= 88 && x <= 166
  const onLowerBranch = y >= 174 && y <= 186 && x >= 88 && x <= 166
  const whiteNode =
    inCircle(x, y, 88, 76, 18) || inCircle(x, y, 88, 128, 18) || inCircle(x, y, 88, 180, 18)
  const endpoint = inCircle(x, y, 168, 76, 14) || inCircle(x, y, 168, 180, 14)
  const accentNode = inCircle(x, y, 168, 128, 20)

  if (onVertical || onUpperBranch || onMiddleBranch || onLowerBranch || whiteNode || endpoint) {
    color = [241, 245, 249, 255]
  }
  if (accentNode) color = [76, 126, 245, 255]
  return color
}

for (let y = 0; y < size; y += 1) {
  const rowStart = y * (size * 4 + 1)
  pixels[rowStart] = 0
  for (let x = 0; x < size; x += 1) {
    const [red, green, blue, alpha] = colorAt(x, y)
    const offset = rowStart + 1 + x * 4
    pixels[offset] = red
    pixels[offset + 1] = green
    pixels[offset + 2] = blue
    pixels[offset + 3] = alpha
  }
}

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const name = Buffer.from(type, 'ascii')
  const result = Buffer.alloc(12 + data.length)
  result.writeUInt32BE(data.length, 0)
  name.copy(result, 4)
  data.copy(result, 8)
  result.writeUInt32BE(crc32(Buffer.concat([name, data])), 8 + data.length)
  return result
}

const header = Buffer.alloc(13)
header.writeUInt32BE(size, 0)
header.writeUInt32BE(size, 4)
header[8] = 8
header[9] = 6
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', header),
  chunk('IDAT', deflateSync(pixels, { level: 9 })),
  chunk('IEND', Buffer.alloc(0))
])

const iconDirectory = Buffer.alloc(22)
iconDirectory.writeUInt16LE(0, 0)
iconDirectory.writeUInt16LE(1, 2)
iconDirectory.writeUInt16LE(1, 4)
iconDirectory[6] = 0
iconDirectory[7] = 0
iconDirectory[8] = 0
iconDirectory[9] = 0
iconDirectory.writeUInt16LE(1, 10)
iconDirectory.writeUInt16LE(32, 12)
iconDirectory.writeUInt32LE(png.length, 14)
iconDirectory.writeUInt32LE(iconDirectory.length, 18)

const outputDirectory = resolve('build')
await mkdir(outputDirectory, { recursive: true })
await writeFile(resolve(outputDirectory, 'icon.png'), png)
await writeFile(resolve(outputDirectory, 'icon.ico'), Buffer.concat([iconDirectory, png]))
