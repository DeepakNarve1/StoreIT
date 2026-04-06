export type FileKind =
  | "image"
  | "video"
  | "audio"
  | "pdf"
  | "office"
  | "archive"
  | "text"
  | "other";

const PDF_MIME_TYPES = new Set(["application/pdf", "application/x-pdf"]);

const OFFICE_MIME_TYPES = new Set([
  "application/msword",
  "application/vnd.ms-word.document.macroenabled.12",
  "application/vnd.ms-word.template.macroenabled.12",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.template",
  "application/rtf",
  "application/vnd.oasis.opendocument.text",
  "application/vnd.ms-excel",
  "application/vnd.ms-excel.template.macroenabled.12",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel.sheet.macroenabled.12",
  "application/vnd.ms-excel.sheet.binary.macroenabled.12",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.template",
  "application/vnd.oasis.opendocument.spreadsheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.ms-powerpoint.slideshow.macroenabled.12",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-powerpoint.presentation.macroenabled.12",
  "application/vnd.openxmlformats-officedocument.presentationml.slideshow",
  "application/vnd.openxmlformats-officedocument.presentationml.template",
  "application/vnd.oasis.opendocument.presentation",
  "application/vnd.oasis.opendocument.graphics",
  "application/vnd.oasis.opendocument.image",
  "application/vnd.oasis.opendocument.chart",
  "application/vnd.oasis.opendocument.formula",
]);

const ARCHIVE_MIME_TYPES = new Set([
  "application/zip",
  "application/x-zip-compressed",
  "application/x-rar-compressed",
  "application/vnd.rar",
  "application/x-7z-compressed",
  "application/x-tar",
  "application/gzip",
  "application/x-gzip",
  "application/x-bzip2",
  "application/x-bzip",
  "application/x-compress",
  "application/x-compressed",
  "application/epub+zip",
  "application/x-epub+zip",
]);

const NON_BROWSER_IMAGE_MIME_TYPES = new Set([
  "image/heic",
  "image/heif",
  "image/heic-sequence",
  "image/heif-sequence",
]);

const TEXT_MIME_TYPES = new Set([
  "application/json",
  "application/ld+json",
  "application/xml",
  "text/xml",
  "application/yaml",
  "text/yaml",
  "application/x-yaml",
  "text/csv",
  "application/csv",
  "text/markdown",
  "text/x-markdown",
  "text/plain",
  "application/javascript",
  "text/javascript",
  "application/typescript",
  "text/typescript",
  "application/sql",
  "text/x-sql",
  "application/x-sh",
  "text/x-shellscript",
  "text/x-python",
  "application/x-python-code",
  "text/x-c",
  "text/x-c++",
  "text/x-java-source",
  "text/x-go",
  "text/x-rust",
  "text/css",
  "text/html",
  "application/xhtml+xml",
]);

export function getFileKind(mimeType: string): FileKind {
  const mime = mimeType.trim().toLowerCase();

  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (PDF_MIME_TYPES.has(mime)) return "pdf";
  if (
    OFFICE_MIME_TYPES.has(mime) ||
    mime.startsWith("application/vnd.openxmlformats-officedocument.") ||
    mime.startsWith("application/vnd.oasis.opendocument.")
  )
    return "office";
  if (ARCHIVE_MIME_TYPES.has(mime)) return "archive";
  if (mime.startsWith("text/") || TEXT_MIME_TYPES.has(mime)) return "text";

  return "other";
}

export function canPreviewImageMimeType(mimeType: string): boolean {
  const mime = mimeType.trim().toLowerCase();
  return mime.startsWith("image/") && !NON_BROWSER_IMAGE_MIME_TYPES.has(mime);
}
