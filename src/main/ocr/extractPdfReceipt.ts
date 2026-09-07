import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { PDFDict, PDFDocument as PdfLibDocument, PDFName, type PDFRawStream, PDFStream, decodePDFRawStream } from 'pdf-lib';
import { PNG } from 'pngjs';

export interface PdfExtractionResult {
  /** Set when the PDF has a real text layer (a digitally-generated invoice/receipt) — more
   * accurate than OCR, and no image extraction/OCR pass is needed at all. */
  text: string | null;
  /** Set when the PDF is a phone scan with no text layer — the page's single embedded photo,
   * written out to a temp file the caller must delete once OCR on it is done. */
  imagePath: string | null;
}

const MIN_TEXT_LAYER_LENGTH = 20;

/**
 * Digitally-generated PDFs (an emailed invoice, an order-confirmation PDF) carry a real text
 * layer that pdfjs-dist can read directly — no OCR needed, and more accurate than OCR would be.
 * Phone-scanned PDFs (from OneDrive's scanner, CamScanner, etc.) have no text layer, just one
 * embedded photo per page — that photo is extracted directly from the PDF's page resources (via
 * pdf-lib, pure JS) and hand to the same tesseract.js OCR pipeline already used for a JPEG/PNG
 * receipt. This deliberately avoids full PDF *rendering* (rasterizing a page to a bitmap), which
 * needs a native canvas library — every option tried on this machine (@napi-rs/canvas, sharp) was
 * blocked by Application Control or lacked PDF support. Reading the embedded image out of the
 * PDF's object table sidesteps that entirely, since a scan-to-PDF page is just one image XObject
 * painted to fill the page — nothing needs rendering, just reading.
 */
export async function extractFromPdf(pdfPath: string, tempDir: string): Promise<PdfExtractionResult> {
  // pdfjs-dist rejects a Node Buffer outright ("provide binary data as Uint8Array") even though
  // Buffer is technically a Uint8Array subclass — copy into a plain one.
  const bytes = new Uint8Array(fs.readFileSync(pdfPath));

  // pdfjs-dist takes ownership of (and detaches) the buffer it's given, so the image-extraction
  // fallback below needs its own untouched copy rather than reusing `bytes` after this call.
  const text = await extractTextLayer(bytes.slice());
  if (text && text.length >= MIN_TEXT_LAYER_LENGTH) {
    return { text, imagePath: null };
  }

  const imagePath = await extractEmbeddedImage(bytes, tempDir);
  return { text: null, imagePath };
}

async function extractTextLayer(bytes: Uint8Array): Promise<string | null> {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loadingTask = pdfjsLib.getDocument({ data: bytes, useSystemFonts: false, disableFontFace: true });
  try {
    const doc = await loadingTask.promise;
    const page = await doc.getPage(1);
    const textContent = await page.getTextContent();
    const text = textContent.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    return text || null;
  } catch {
    return null;
  } finally {
    await loadingTask.destroy();
  }
}

function nameOf(obj: unknown): string | null {
  return obj ? String(obj) : null;
}

function numberOf(obj: unknown): number | null {
  const asNumber = (obj as { asNumber?: () => number } | null)?.asNumber;
  return typeof asNumber === 'function' ? asNumber.call(obj) : null;
}

/** Reads the first Image XObject on the PDF's first page — a scan-to-PDF page has exactly one,
 * sized to the full page. Returns the path to a temp file the caller owns (JPEG or PNG), or null
 * if the page has no image, or the image uses a codec this doesn't handle (JPEG 2000, CCITT fax
 * — rare for phone scans, which are virtually always plain JPEG). */
async function extractEmbeddedImage(bytes: Uint8Array, tempDir: string): Promise<string | null> {
  try {
    const doc = await PdfLibDocument.load(bytes, { ignoreEncryption: true });
    if (doc.getPageCount() === 0) return null;
    const page = doc.getPage(0);
    const resources = page.node.Resources();
    const xobjectDict = resources?.lookupMaybe(PDFName.of('XObject'), PDFDict);
    if (!xobjectDict) return null;

    for (const key of xobjectDict.keys()) {
      // Every Image XObject pdf-lib's parser produces is actually a PDFRawStream at runtime —
      // decodePDFRawStream()/getContents() need that concrete type, but it isn't one of
      // lookupMaybe's overloads (only the abstract PDFStream base is), so this cast just bridges
      // the declared type to the type we know it always is.
      const stream = xobjectDict.lookupMaybe(key, PDFStream) as PDFRawStream | undefined;
      if (!stream) continue;
      if (nameOf(stream.dict.lookup(PDFName.of('Subtype'))) !== '/Image') continue;

      const filterName = nameOf(stream.dict.lookup(PDFName.of('Filter')));

      if (filterName === '/DCTDecode') {
        // DCTDecode means the stored bytes ARE a complete standalone JPEG file already — no
        // decoding needed, write them out as-is.
        const jpegPath = path.join(tempDir, `receipt-ocr-${crypto.randomUUID()}.jpg`);
        fs.writeFileSync(jpegPath, stream.getContents());
        return jpegPath;
      }
      if (filterName === '/JPXDecode' || filterName === '/CCITTFaxDecode') {
        continue; // JPEG2000/fax scans need a codec we don't have — skip, same as before.
      }

      const width = numberOf(stream.dict.lookup(PDFName.of('Width')));
      const height = numberOf(stream.dict.lookup(PDFName.of('Height')));
      const bitsPerComponent = numberOf(stream.dict.lookup(PDFName.of('BitsPerComponent')));
      const colorSpace = nameOf(stream.dict.lookup(PDFName.of('ColorSpace')));
      if (!width || !height || bitsPerComponent !== 8) continue;

      let raw: Uint8Array;
      try {
        raw = decodePDFRawStream(stream).decode();
      } catch {
        continue;
      }

      const png = rawSamplesToPng(raw, width, height, colorSpace ?? '');
      if (!png) continue;

      const pngPath = path.join(tempDir, `receipt-ocr-${crypto.randomUUID()}.png`);
      fs.writeFileSync(pngPath, PNG.sync.write(png));
      return pngPath;
    }
    return null;
  } catch {
    return null;
  }
}

function rawSamplesToPng(raw: Uint8Array, width: number, height: number, colorSpace: string): PNG | null {
  const png = new PNG({ width, height });
  if (colorSpace === '/DeviceRGB' && raw.length >= width * height * 3) {
    for (let i = 0, p = 0; i < width * height; i++, p += 3) {
      const o = i << 2;
      png.data[o] = raw[p];
      png.data[o + 1] = raw[p + 1];
      png.data[o + 2] = raw[p + 2];
      png.data[o + 3] = 255;
    }
    return png;
  }
  if (colorSpace === '/DeviceGray' && raw.length >= width * height) {
    for (let i = 0; i < width * height; i++) {
      const o = i << 2;
      const v = raw[i];
      png.data[o] = v;
      png.data[o + 1] = v;
      png.data[o + 2] = v;
      png.data[o + 3] = 255;
    }
    return png;
  }
  return null;
}
