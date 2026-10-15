import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { inflateSync } from 'node:zlib'
import { test } from 'node:test'

const assets = [
  ['cab-body.png', 1536, 1024],
  ['cab-door.png', 1157, 1359],
  ['student.png', 1024, 1536],
  ['campus.png', 1774, 887],
  ['palm.png', 1024, 1536],
]
const assetUrl = (name) => new URL(`../src/assets/services/${name}`, import.meta.url)

function parsePng(buffer) {
  assert.deepEqual(buffer.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), 'has PNG signature')
  let offset = 8, header, data = []
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.toString('ascii', offset + 4, offset + 8)
    const chunk = buffer.subarray(offset + 8, offset + 8 + length)
    assert.ok(offset + 12 + length <= buffer.length, `complete ${type} chunk`)
    if (type === 'IHDR') header = chunk
    if (type === 'IDAT') data.push(chunk)
    offset += length + 12
    if (type === 'IEND') break
  }
  assert.equal(header?.length, 13, 'has an IHDR chunk')
  assert.ok(data.length, 'has image data')
  return { header, pixels: inflateSync(Buffer.concat(data)) }
}

function alphaCounts(encoded, width, height) {
  const stride = width * 4, rows = Buffer.alloc(stride * height)
  let input = 0
  for (let y = 0; y < height; y++) {
    const filter = encoded[input++], row = rows.subarray(y * stride, (y + 1) * stride)
    for (let x = 0; x < stride; x++, input++) {
      const left = x >= 4 ? row[x - 4] : 0
      const above = y ? rows[(y - 1) * stride + x] : 0
      const upperLeft = y && x >= 4 ? rows[(y - 1) * stride + x - 4] : 0
      const value = encoded[input]
      if (filter === 0) row[x] = value
      else if (filter === 1) row[x] = (value + left) & 255
      else if (filter === 2) row[x] = (value + above) & 255
      else if (filter === 3) row[x] = (value + Math.floor((left + above) / 2)) & 255
      else if (filter === 4) {
        const p = left + above - upperLeft, pa = Math.abs(p - left), pb = Math.abs(p - above), pc = Math.abs(p - upperLeft)
        row[x] = (value + (pa <= pb && pa <= pc ? left : pb <= pc ? above : upperLeft)) & 255
      } else assert.fail(`unsupported PNG filter ${filter}`)
    }
  }
  assert.equal(input, encoded.length, 'scanlines have the expected RGBA length')
  let transparent = 0, visible = 0
  for (let i = 3; i < rows.length; i += 4) {
    if (rows[i] === 0) transparent++
    if (rows[i] >= 200) visible++
  }
  return { transparent, visible }
}

for (const [name, width, height] of assets) test(`${name} is a transparent RGBA service cutout`, async () => {
  const { header, pixels } = parsePng(await readFile(assetUrl(name)))
  assert.equal(header.readUInt32BE(0), width, 'width')
  assert.equal(header.readUInt32BE(4), height, 'height')
  assert.equal(header[8], 8, '8-bit channels')
  assert.equal(header[9], 6, 'RGBA color type')
  const { transparent, visible } = alphaCounts(pixels, width, height)
  assert.ok(transparent >= width * height * 0.01, 'has a meaningful transparent background')
  assert.ok(visible >= width * height * 0.01, 'has meaningful visible subject pixels')
})
