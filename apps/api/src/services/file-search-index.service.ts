import path from "path";
import { Prisma } from "@prisma/client";
import * as XLSX from "xlsx";
import { prisma } from "../utils/prisma";
import { downloadFileBuffer } from "./storage.service";

const MAX_SEARCH_TEXT_CHARS = 500_000;
const MAX_OCR_BYTES = 12 * 1024 * 1024;

function truncate(text: string): string {
  const t = text.trim();
  if (t.length <= MAX_SEARCH_TEXT_CHARS) return t;
  return `${t.slice(0, MAX_SEARCH_TEXT_CHARS)}\n…`;
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Unicode + invisible-char cleanup so ILIKE / FTS match OCR output more reliably */
function normalizeForSearchIndex(text: string): string {
  return normalizeWhitespace(
    text
      .normalize("NFKC")
      .replace(/[\u200B-\u200D\uFEFF]/g, "")
      .replace(/[‐‑‒–—−]/g, "-"),
  );
}

/** Detect image when DB/browser MIME is wrong (e.g. generic type) or after reindex. */
function sniffImageMimeFromBuffer(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  ) {
    return "image/png";
  }
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) {
    return "image/gif";
  }
  if (
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    return "image/webp";
  }
  if (buf[0] === 0x42 && buf[1] === 0x4d) {
    return "image/bmp";
  }
  return null;
}

function imageLikeExtension(fileName: string): boolean {
  return /\.(png|jpe?g|gif|webp|bmp|tiff?)$/i.test(fileName);
}

function resolveEffectiveMimeForIndexing(
  mimeType: string,
  fileName: string,
  buffer: Buffer,
): string {
  const mt = (mimeType || "").toLowerCase();
  if (mt.startsWith("image/")) {
    return mt === "image/jpg" ? "image/jpeg" : mt;
  }
  const sniffed = sniffImageMimeFromBuffer(buffer);
  if (sniffed) return sniffed;
  if (imageLikeExtension(fileName)) {
    const ext = path.extname(fileName).toLowerCase();
    if (ext === ".png") return "image/png";
    if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
    if (ext === ".gif") return "image/gif";
    if (ext === ".webp") return "image/webp";
    if (ext === ".bmp") return "image/bmp";
    if (ext === ".tif" || ext === ".tiff") return "image/tiff";
  }
  return mt;
}

function isProbablyTextMime(mime: string): boolean {
  const m = mime.toLowerCase();
  return (
    m.startsWith("text/") ||
    m === "application/json" ||
    m === "application/xml" ||
    m === "application/javascript" ||
    m.includes("xml") ||
    m.includes("csv")
  );
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return normalizeWhitespace(result?.text ?? "");
  } finally {
    await parser.destroy();
  }
}

async function extractSpreadsheetText(buffer: Buffer): Promise<string> {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const parts: string[] = [];
  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name];
    if (!sheet) continue;
    parts.push(XLSX.utils.sheet_to_csv(sheet));
  }
  return normalizeWhitespace(parts.join("\n"));
}

/**
 * Newspaper scans / phone photos: small text needs higher effective resolution.
 * Grayscale + normalize improves contrast on newsprint noise.
 */
async function preprocessImageForOcr(buffer: Buffer): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  const meta = await sharp(buffer).metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (w === 0 || h === 0) {
    return buffer;
  }

  const minSide = Math.min(w, h);
  // Upscale small scans/photos so body copy is legible; never shrink (hurts OCR).
  const TARGET_MIN_SIDE = 2000;
  const scale =
    minSide < TARGET_MIN_SIDE
      ? Math.min(2.5, TARGET_MIN_SIDE / minSide)
      : 1;

  let pipeline = sharp(buffer).rotate();

  if (scale > 1.01) {
    pipeline = pipeline.resize({
      width: Math.round(w * scale),
      height: Math.round(h * scale),
      fit: "inside",
    });
  }

  return pipeline.greyscale().normalize().png().toBuffer();
}

async function extractImageOcr(buffer: Buffer, fileName: string): Promise<string> {
  if (buffer.length > MAX_OCR_BYTES) {
    console.warn("[search-index] OCR skipped (file too large):", fileName);
    return "";
  }
  if (process.env.SEARCH_OCR_ENABLED === "0") {
    return "";
  }

  const Tesseract = await import("tesseract.js");
  const ocrDebug = process.env.SEARCH_OCR_DEBUG === "1";

  let prepared: Buffer;
  try {
    prepared = await preprocessImageForOcr(buffer);
  } catch (prepErr) {
    console.warn(
      "[search-index] OCR preprocess fallback to raw buffer:",
      fileName,
      prepErr instanceof Error ? prepErr.message : prepErr,
    );
    prepared = buffer;
  }

  const worker = await Tesseract.createWorker("eng", Tesseract.OEM.LSTM_ONLY, {
    logger: ocrDebug
      ? (m: { status: string; progress: number }) =>
          console.log("[ocr]", fileName, m.status, m.progress)
      : undefined,
  });

  try {
    await worker.setParameters({
      user_defined_dpi: "300",
    });

    // Start with stable modes; AUTO_OSD can fail on some inputs / Node workers.
    const psms = [
      Tesseract.PSM.AUTO,
      Tesseract.PSM.SPARSE_TEXT,
      Tesseract.PSM.SINGLE_COLUMN,
      Tesseract.PSM.SINGLE_BLOCK,
      Tesseract.PSM.AUTO_OSD,
    ] as const;

    const chunks: string[] = [];
    for (const tessedit_pageseg_mode of psms) {
      try {
        await worker.setParameters({
          tessedit_pageseg_mode,
          user_defined_dpi: "300",
        });
        const {
          data: { text },
        } = await worker.recognize(prepared);
        const t = (text ?? "").trim();
        if (t.length > 0) {
          chunks.push(t);
        }
      } catch (passErr) {
        console.error(
          "[search-index] OCR pass failed:",
          fileName,
          `PSM=${tessedit_pageseg_mode}`,
          passErr instanceof Error ? passErr.message : passErr,
        );
      }
    }

    const merged = normalizeForSearchIndex(chunks.join("\n"));
    if (merged.length === 0) {
      console.warn(
        "[search-index] OCR returned no text:",
        fileName,
        "bufferBytes=",
        buffer.length,
        "preparedBytes=",
        prepared.length,
      );
    }
    if (ocrDebug) {
      const sample = merged.slice(0, 400).replace(/\s+/g, " ");
      console.log("[ocr] result chars:", fileName, merged.length, sample);
    }
    return merged;
  } catch (err) {
    console.error(
      "[search-index] OCR worker failed:",
      fileName,
      err instanceof Error ? err.stack ?? err.message : err,
    );
    return "";
  } finally {
    await worker.terminate().catch(() => {});
  }
}

/**
 * Extract searchable plain text from an in-memory file (upload / version buffer).
 */
export async function extractSearchableText(
  buffer: Buffer,
  mimeType: string,
  fileName: string,
): Promise<string> {
  const effectiveMime = resolveEffectiveMimeForIndexing(mimeType, fileName, buffer);
  const mt = effectiveMime.toLowerCase();
  const lowerName = fileName.toLowerCase();

  try {
    if (mt === "application/pdf" || lowerName.endsWith(".pdf")) {
      return truncate(normalizeForSearchIndex(await extractPdfText(buffer)));
    }

    if (
      mt.includes("spreadsheetml") ||
      mt === "text/csv" ||
      lowerName.endsWith(".csv") ||
      lowerName.endsWith(".xlsx") ||
      lowerName.endsWith(".xls")
    ) {
      return truncate(normalizeForSearchIndex(await extractSpreadsheetText(buffer)));
    }

    if (isProbablyTextMime(mt) || lowerName.endsWith(".txt") || lowerName.endsWith(".md")) {
      const raw = buffer.toString("utf8");
      return truncate(normalizeForSearchIndex(raw));
    }

    if (mt.startsWith("image/")) {
      const ocr = await extractImageOcr(buffer, fileName);
      return truncate(normalizeForSearchIndex(ocr));
    }

    return "";
  } catch (err) {
    console.warn(
      "[search-index] extract failed:",
      fileName,
      mt,
      err instanceof Error ? err.message : err,
    );
    return "";
  }
}

/** Smoke test for Tesseract + sharp (diagnostics endpoint). */
export async function runOcrSelfTest(): Promise<{
  ok: boolean;
  text: string;
  error?: string;
}> {
  try {
    const sharp = (await import("sharp")).default;
    const Tesseract = await import("tesseract.js");
    const svg = Buffer.from(
      `<svg width="320" height="80"><rect fill="white" width="100%" height="100%"/><text x="12" y="52" font-size="36" font-family="Arial" fill="black">OCR_SELF_TEST_OK</text></svg>`,
    );
    const png = await sharp(svg).png().toBuffer();
    const worker = await Tesseract.createWorker(
      "eng",
      Tesseract.OEM.LSTM_ONLY,
    );
    try {
      await worker.setParameters({
        tessedit_pageseg_mode: Tesseract.PSM.AUTO,
      });
      const { data } = await worker.recognize(png);
      const text = (data.text ?? "").trim();
      const ok = text.includes("OCR_SELF_TEST") || text.includes("SELF_TEST");
      return { ok, text };
    } finally {
      await worker.terminate().catch(() => {});
    }
  } catch (e) {
    return {
      ok: false,
      text: "",
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function indexFileContent(params: {
  fileId: string;
  buffer: Buffer;
  mimeType: string;
  fileName: string;
}): Promise<void> {
  const text = await extractSearchableText(
    params.buffer,
    params.mimeType,
    params.fileName,
  );
  await prisma.$executeRaw`
    UPDATE "File"
    SET
      "searchText" = ${text.length > 0 ? text : null},
      "searchIndexedAt" = ${new Date()}
    WHERE "id" = ${params.fileId}
  `;
}

/** Re-download from storage and rebuild search text (admin / repair). */
export async function reindexFileFromStorage(fileId: string): Promise<void> {
  const row = await prisma.file.findFirst({
    where: { id: fileId, isDeleted: false },
    select: { storageKey: true, mimeType: true, name: true },
  });
  if (!row) {
    throw new Error("File not found");
  }
  const buffer = await downloadFileBuffer(row.storageKey);
  await indexFileContent({
    fileId,
    buffer,
    mimeType: row.mimeType,
    fileName: row.name,
  });
}
