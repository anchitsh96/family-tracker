// Native PDF text extractor backed by iOS PDFKit + Vision.
//
// JS surface (see src/native/pdfText.ts):
//   extractText(uri, password?)    → fast, PDFKit `.string`
//   extractTextOcr(uri, password?) → slower (~2s/page), Vision OCR
//
// Both methods throw the same error codes:
//   NEEDS_PASSWORD     PDF is encrypted; password is required
//   WRONG_PASSWORD     password did not unlock the document
//   CORRUPT            PDF could not be opened
//   NOT_FOUND          file URI invalid
//
// When to use which:
// - Single-language, single-column-table PDFs (Fisdom): use `extractText`.
//   PDFKit `.string` is fast and precise enough.
// - Bilingual or multi-column PDFs where reading order is fragmented
//   (CDSL CAS): use `extractTextOcr`. Renders each page to a bitmap and
//   uses Vision's text recognizer, which gives reliable row-major output.

import Foundation
import PDFKit
import React
import Vision
import UIKit

@objc(KoshPdfText)
class KoshPdfText: NSObject {

  @objc static func requiresMainQueueSetup() -> Bool { return false }

  // -------------------------------------------------------------------------
  // Fast path — PDFKit `.string`.
  // -------------------------------------------------------------------------

  @objc(extractText:password:resolver:rejecter:)
  func extractText(
    _ uri: NSString,
    password: NSString,
    resolver: @escaping RCTPromiseResolveBlock,
    rejecter: @escaping RCTPromiseRejectBlock
  ) {
    guard let doc = Self.openDoc(uri: uri, password: password, rejecter: rejecter) else { return }
    var pages: [String] = []
    pages.reserveCapacity(doc.pageCount)
    for i in 0..<doc.pageCount {
      pages.append(doc.page(at: i)?.string ?? "")
    }
    resolver(["pages": pages])
  }

  // -------------------------------------------------------------------------
  // OCR path — render each page, run Vision text recognition, sort row-major.
  // -------------------------------------------------------------------------

  @objc(extractTextOcr:password:resolver:rejecter:)
  func extractTextOcr(
    _ uri: NSString,
    password: NSString,
    resolver: @escaping RCTPromiseResolveBlock,
    rejecter: @escaping RCTPromiseRejectBlock
  ) {
    guard let doc = Self.openDoc(uri: uri, password: password, rejecter: rejecter) else { return }
    DispatchQueue.global(qos: .userInitiated).async {
      var pages: [String] = []
      pages.reserveCapacity(doc.pageCount)
      for i in 0..<doc.pageCount {
        if let page = doc.page(at: i) {
          pages.append(Self.ocrPage(page))
        } else {
          pages.append("")
        }
      }
      DispatchQueue.main.async { resolver(["pages": pages]) }
    }
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  // Open + (optionally) unlock a PDF, returning the document or rejecting
  // the promise with the right error code.
  private static func openDoc(
    uri: NSString,
    password: NSString,
    rejecter: RCTPromiseRejectBlock
  ) -> PDFDocument? {
    let uriStr = uri as String
    let url: URL
    if uriStr.hasPrefix("file://") {
      guard let u = URL(string: uriStr) else {
        rejecter("NOT_FOUND", "Invalid file URI", nil); return nil
      }
      url = u
    } else {
      url = URL(fileURLWithPath: uriStr)
    }
    guard let doc = PDFDocument(url: url) else {
      rejecter("CORRUPT", "PDFDocument could not open the file", nil); return nil
    }
    let pwd = password as String
    if doc.isLocked {
      if pwd.isEmpty {
        rejecter("NEEDS_PASSWORD", "PDF is encrypted; password required", nil); return nil
      }
      if !doc.unlock(withPassword: pwd) {
        rejecter("WRONG_PASSWORD", "Wrong password", nil); return nil
      }
    }
    return doc
  }

  // Render a single PDF page → image → run Vision text recognition →
  // group observations into row-major lines.
  private static func ocrPage(_ page: PDFPage) -> String {
    let bounds = page.bounds(for: .mediaBox)
    let format = UIGraphicsImageRendererFormat()
    // 2x scale gives Vision enough pixel density on small text without
    // blowing up memory.
    format.scale = 2.0
    format.opaque = true
    let renderer = UIGraphicsImageRenderer(size: bounds.size, format: format)
    let img = renderer.image { ctx in
      UIColor.white.setFill()
      ctx.fill(CGRect(origin: .zero, size: bounds.size))
      let cg = ctx.cgContext
      cg.saveGState()
      // PDF coords: origin bottom-left, Y increases upward. UIKit: top-left,
      // Y increases downward. Flip so the page draws right-side up.
      cg.translateBy(x: 0, y: bounds.height)
      cg.scaleBy(x: 1.0, y: -1.0)
      page.draw(with: .mediaBox, to: cg)
      cg.restoreGState()
    }
    guard let cgImage = img.cgImage else { return "" }

    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = false
    // English (Indian) handles ₹ glyph and Indian number formatting better
    // than en-US. We don't try Hindi — for CAS we only need the English
    // tables, and including Hindi would dilute confidence on tabular text.
    if #available(iOS 16.0, *) {
      request.automaticallyDetectsLanguage = false
    }
    request.recognitionLanguages = ["en-IN", "en-US"]
    let handler = VNImageRequestHandler(cgImage: cgImage, orientation: .up, options: [:])
    do {
      try handler.perform([request])
    } catch {
      return ""
    }
    guard let observations = request.results else { return "" }

    // Vision Y is normalized 0..1 with 0 at the bottom. Sort top-to-bottom
    // (descending Y) then left-to-right (ascending X).
    let sorted = observations.sorted { a, b in
      let dy = a.boundingBox.midY - b.boundingBox.midY
      if abs(dy) > 0.005 { return a.boundingBox.midY > b.boundingBox.midY }
      return a.boundingBox.minX < b.boundingBox.minX
    }

    // Group consecutive observations with similar Y into a single line.
    // 0.005 of a normalized page ≈ 4-5pt at typical PDF page heights.
    var lines: [String] = []
    var current = ""
    var lineY: CGFloat = sorted.first?.boundingBox.midY ?? 0
    for obs in sorted {
      let s = obs.topCandidates(1).first?.string ?? ""
      if abs(obs.boundingBox.midY - lineY) > 0.005 {
        if !current.isEmpty { lines.append(current) }
        current = s
        lineY = obs.boundingBox.midY
      } else {
        current = current.isEmpty ? s : "\(current) \(s)"
      }
    }
    if !current.isEmpty { lines.append(current) }
    return lines.joined(separator: "\n")
  }
}
