// Typed wrapper around the KoshPdfText native module (ios/Kosh/KoshPdfText.swift).
//
// Backed by iOS PDFKit. Handles password-protected PDFs.
// Produces text in PDFKit's native order — close enough to pdftotext -raw
// that our parser fixtures (developed against pdftotext -raw) match
// directly.

import { NativeModules } from 'react-native';

interface KoshPdfTextNative {
  extractText(uri: string, password: string): Promise<{ pages: string[] }>;
  extractTextOcr(uri: string, password: string): Promise<{ pages: string[] }>;
}

const Native = NativeModules.KoshPdfText as KoshPdfTextNative | undefined;

export type PdfTextErrorCode =
  | 'NEEDS_PASSWORD'
  | 'WRONG_PASSWORD'
  | 'CORRUPT'
  | 'NOT_FOUND'
  | 'NOT_LINKED';

export class PdfTextError extends Error {
  code: PdfTextErrorCode;
  constructor(code: PdfTextErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = 'PdfTextError';
  }
}

export interface ExtractedPdf {
  pages: string[];
  fullText: string;
}

export type ExtractMode = 'fast' | 'ocr';

/**
 * Extract text from a PDF at `uri`. Pass a password if the PDF is encrypted.
 *
 * `mode`:
 *   - 'fast' (default): PDFKit `.string`. Fast (<100ms) but reading order
 *     is fragmented for tabular PDFs.
 *   - 'ocr': renders each page to a bitmap and runs Vision text recognition.
 *     Reliable row-major output. ~2 seconds per page on a recent iPhone.
 *
 * Throws `PdfTextError` with code:
 *   NEEDS_PASSWORD  — encrypted PDF, password not provided / empty
 *   WRONG_PASSWORD  — supplied password did not unlock the PDF
 *   CORRUPT         — PDFKit could not parse the file
 *   NOT_FOUND       — uri did not resolve to a readable file
 *   NOT_LINKED      — native module is not registered in the running app
 *                     (only happens in Expo Go or before a rebuild)
 */
export async function extractPdfText(
  uri: string,
  password?: string,
  mode: ExtractMode = 'fast'
): Promise<ExtractedPdf> {
  if (!Native) {
    throw new PdfTextError(
      'NOT_LINKED',
      'KoshPdfText native module is not linked. Rebuild the app with `expo run:ios` after this commit.'
    );
  }
  try {
    const res =
      mode === 'ocr'
        ? await Native.extractTextOcr(uri, password ?? '')
        : await Native.extractText(uri, password ?? '');
    const pages = Array.isArray(res?.pages) ? res.pages : [];
    return { pages, fullText: pages.join('\n') };
  } catch (err: any) {
    const code = (err?.code ?? 'CORRUPT') as PdfTextErrorCode;
    throw new PdfTextError(code, err?.message ?? 'PDF text extraction failed');
  }
}
