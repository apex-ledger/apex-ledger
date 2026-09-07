import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createWorker, PSM } from 'tesseract.js';
import { Jimp } from 'jimp';
import { parseReceiptText } from '@shared/domain/receipts/parseReceiptText';
import { extractFromPdf } from './extractPdfReceipt';

export interface ReceiptOcrResult {
  vendorNameGuess: string | null;
  dateGuess: string | null;
  amountCentsGuess: number | null;
  taxAmountCentsGuess: number | null;
  currencyGuess: 'USD' | null;
  rawText: string;
}

const BLANK_RESULT: ReceiptOcrResult = {
  vendorNameGuess: null,
  dateGuess: null,
  amountCentsGuess: null,
  taxAmountCentsGuess: null,
  currencyGuess: null,
  rawText: '',
};

const MIN_LONGEST_SIDE_FOR_OCR = 1800;

// Scanned/photographed receipts are usually low-res, unevenly lit, and off-white rather than
// pure white/black — greyscale + normalize + contrast + upscaling gives Tesseract a much
// cleaner, higher-contrast image to work with than the raw camera/scanner output.
async function preprocessForOcr(imagePath: string): Promise<string> {
  const image = await Jimp.read(imagePath);
  image.greyscale();
  image.normalize();
  image.contrast(0.25);
  const longestSide = Math.max(image.width, image.height);
  if (longestSide > 0 && longestSide < MIN_LONGEST_SIDE_FOR_OCR) {
    image.scale(MIN_LONGEST_SIDE_FOR_OCR / longestSide);
  }
  const outPath = path.join(os.tmpdir(), `receipt-ocr-${crypto.randomUUID()}.png`) as `${string}.png`;
  await image.write(outPath);
  return outPath;
}

async function runOcrOnImage(imagePath: string): Promise<ReceiptOcrResult> {
  const worker = await createWorker('eng');
  let preprocessedPath: string | null = null;
  try {
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK });
    try {
      preprocessedPath = await preprocessForOcr(imagePath);
    } catch {
      preprocessedPath = null;
    }
    const {
      data: { text },
    } = await worker.recognize(preprocessedPath ?? imagePath);
    return { ...parseReceiptText(text), rawText: text };
  } finally {
    await worker.terminate();
    if (preprocessedPath) fs.rm(preprocessedPath, { force: true }, () => {});
  }
}

/** Runs OCR against a receipt photo and pulls out the fields the review form can pre-fill.
 * Heuristic, not exact — the form always stays editable so a bad guess just means retyping
 * that one field instead of typing everything from scratch. */
export async function extractReceiptFields(filePath: string): Promise<ReceiptOcrResult> {
  if (path.extname(filePath).toLowerCase() === '.pdf') {
    return extractReceiptFieldsFromPdf(filePath);
  }
  return runOcrOnImage(filePath);
}

/** A PDF receipt is either a digitally-generated document (has a real text layer — extracted
 * directly, more accurate than OCR and much faster) or a phone scan (no text layer, just one
 * embedded photo per page — that photo is pulled out and run through the same OCR path as a
 * JPEG/PNG receipt). See extractPdfReceipt.ts for why this avoids full PDF rendering. */
async function extractReceiptFieldsFromPdf(pdfPath: string): Promise<ReceiptOcrResult> {
  const { text, imagePath } = await extractFromPdf(pdfPath, os.tmpdir());
  if (text) {
    return { ...parseReceiptText(text), rawText: text };
  }
  if (imagePath) {
    try {
      return await runOcrOnImage(imagePath);
    } finally {
      fs.rm(imagePath, { force: true }, () => {});
    }
  }
  return BLANK_RESULT;
}
