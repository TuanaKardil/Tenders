import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import { extractTextFromDocument } from "./ai";

/**
 * Document text extraction (PIPELINE.md stage 4). Download → extract text →
 * the caller DELETES the file. We only ever keep the text, never the file.
 *
 *   PDF (text layer) → pdf-parse
 *   PDF (scanned/empty) & images (PNG/JPG) → Gemini multimodal OCR
 *   DOCX → mammoth
 */

export const MAX_BYTES = 25 * 1024 * 1024; // skip anything larger than 25 MB
export const DOWNLOAD_TIMEOUT_MS = 30_000; // 30s per download

const UA = "Mozilla/5.0 AppleWebKit/537.36 Chrome/120 Safari/537.36";

export type FileKind = "pdf" | "docx" | "png" | "jpg";
export type ExtractionMethod = "pdf-parse" | "mammoth" | "gemini-multimodal";

/** Map a source file_type / URL extension onto a supported kind, or null to skip. */
export function fileKind(fileType: string | null, url: string): FileKind | null {
  const raw = (fileType || "").toLowerCase();
  const ext = url.toLowerCase().match(/\.([a-z0-9]{2,5})(?:\?|#|$)/)?.[1] ?? "";
  const t = raw || ext;
  if (t.includes("pdf")) return "pdf";
  if (t.includes("docx") || t.includes("wordprocessingml")) return "docx";
  if (t.includes("png")) return "png";
  if (t.includes("jpg") || t.includes("jpeg")) return "jpg";
  return null; // .doc (legacy), xls, zip, etc. → skip
}

/** Which extraction path a kind takes before download (PDFs may still fall back to Gemini). */
export function plannedMethod(kind: FileKind): ExtractionMethod {
  if (kind === "docx") return "mammoth";
  if (kind === "pdf") return "pdf-parse";
  return "gemini-multimodal";
}

/** HEAD the URL to learn its byte size for the dry-run (best effort; null if unknown). */
export async function headSize(url: string): Promise<number | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), DOWNLOAD_TIMEOUT_MS);
    const res = await fetch(url, { method: "HEAD", headers: { "User-Agent": UA }, signal: ctrl.signal });
    clearTimeout(timer);
    const len = res.headers.get("content-length");
    return len ? Number(len) : null;
  } catch {
    return null;
  }
}

function mb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(0)}MB`;
}

/**
 * Download with a timeout and a size ceiling (both overridable for retries).
 * Throws Errors with clear, specific reasons: "size limit: 154MB",
 * "request timeout (60s)", "HTTP 404".
 */
export async function downloadDocument(
  url: string,
  opts: { maxBytes?: number; timeoutMs?: number } = {}
): Promise<Buffer> {
  const maxBytes = opts.maxBytes ?? MAX_BYTES;
  const timeoutMs = opts.timeoutMs ?? DOWNLOAD_TIMEOUT_MS;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const len = res.headers.get("content-length");
    if (len && Number(len) > maxBytes) throw new Error(`size limit: ${mb(Number(len))} > ${mb(maxBytes)}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > maxBytes) throw new Error(`size limit: ${mb(buf.byteLength)} > ${mb(maxBytes)}`);
    return buf;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`request timeout (${timeoutMs / 1000}s)`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

const MIME: Record<Exclude<FileKind, "pdf" | "docx">, string> = {
  png: "image/png",
  jpg: "image/jpeg",
};

export interface ExtractResult {
  text: string;
  method: ExtractionMethod;
}

/** Extract text from an already-downloaded buffer. */
export async function extractText(buffer: Buffer, kind: FileKind): Promise<ExtractResult> {
  if (kind === "docx") {
    const { value } = await mammoth.extractRawText({ buffer });
    return { text: value.trim(), method: "mammoth" };
  }

  if (kind === "pdf") {
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    const result = await parser.getText();
    const text = (result.text ?? "").trim();
    // Scanned PDFs often carry a TRIVIAL text layer (a header, a page number)
    // — treat anything under the threshold as "no real text" and OCR it.
    const MIN_REAL_TEXT = 100;
    if (text.length >= MIN_REAL_TEXT) return { text, method: "pdf-parse" };
    const ocr = await extractTextFromDocument(buffer, "application/pdf");
    // Keep whichever attempt yielded more (OCR can also come back thin).
    if (ocr.trim().length > text.length) return { text: ocr.trim(), method: "gemini-multimodal" };
    return { text, method: "pdf-parse" };
  }

  // PNG / JPG → Gemini multimodal.
  const ocr = await extractTextFromDocument(buffer, MIME[kind]);
  return { text: ocr.trim(), method: "gemini-multimodal" };
}
