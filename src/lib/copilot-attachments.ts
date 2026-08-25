// What the copilot will accept as an attachment, and how big.
//
// Shared by the browser (which reads the file) and the route (which must not
// trust it). One definition so the picker never offers something the server
// then rejects.
//
// Three kinds, because Claude handles the two hard ones natively:
//   image — screenshots, photos of a worksheet. Sent as an image block.
//   pdf   — sent as a document block; no parsing or OCR on our side.
//   text  — plain text, markdown, csv, and .docx (extracted server-side).
//
// Deliberately NOT accepted: .pptx and .doc. Drive can't export an uploaded
// PowerPoint and Claude can't read one, so accepting it would mean silently
// attaching nothing. Saying so is kinder than a mystery.

export const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export const IMAGE_MIMES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
export const TEXT_MIMES = ["text/plain", "text/markdown", "text/csv", "application/json"];
export const PDF_MIME = "application/pdf";

export type AttachmentKind = "image" | "pdf" | "text";

/** Per-file cap. Base64 inflates by ~33%, so this is ~5.3MB on the wire. */
export const MAX_FILE_BYTES = 4 * 1024 * 1024;
export const MAX_ATTACHMENTS = 5;
export const MAX_TOTAL_BYTES = 12 * 1024 * 1024;
/** Cap on extracted text, so a 400-page .docx cannot swallow the context. */
export const MAX_TEXT_CHARS = 40_000;

export type OutgoingAttachment = {
  name: string;
  mediaType: string;
  kind: AttachmentKind;
  /** base64 for image/pdf/docx; plain text for already-text files. */
  data: string;
  size: number;
};

/** The `accept` attribute for the file picker — same list, one source. */
export const ACCEPT_ATTR = [
  ...IMAGE_MIMES,
  PDF_MIME,
  ...TEXT_MIMES,
  DOCX_MIME,
  ".md",
  ".csv",
  ".txt",
  ".docx",
].join(",");

/**
 * Which of the three shapes a MIME type takes, or null when we cannot use it.
 * Browsers sometimes report an empty type for .md/.csv, so the filename is a
 * fallback rather than a second source of truth.
 */
export function kindFor(mediaType: string, filename = ""): AttachmentKind | null {
  if (IMAGE_MIMES.includes(mediaType)) return "image";
  if (mediaType === PDF_MIME) return "pdf";
  if (TEXT_MIMES.includes(mediaType) || mediaType === DOCX_MIME) return "text";
  if (!mediaType && /\.(txt|md|csv|json)$/i.test(filename)) return "text";
  if (/\.docx$/i.test(filename)) return "text";
  return null;
}

/** Why a file was refused, in words worth showing a teacher. */
export function rejectionReason(file: { name: string; type: string; size: number }): string | null {
  if (file.size > MAX_FILE_BYTES) {
    return `${file.name} is too big (max ${Math.round(MAX_FILE_BYTES / 1024 / 1024)}MB).`;
  }
  if (kindFor(file.type, file.name)) return null;

  if (/\.pptx?$/i.test(file.name)) {
    return `${file.name} — PowerPoint files can't be read directly. Export it as a PDF, or paste a screenshot of the slide.`;
  }
  if (/\.docx?$/i.test(file.name)) {
    return `${file.name} — old .doc files can't be read. Save it as .docx or a PDF.`;
  }
  return `${file.name} — can't read that kind of file. Images, PDFs, .docx and plain text work.`;
}
