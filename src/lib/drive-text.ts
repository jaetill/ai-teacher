// Drive text extraction, hoisted out of /api/materials/summarize (#679).
//
// Two features now need the plain text of a teacher's Drive file: the material
// summarizer, and the quote-anchored item writer, which needs the actual words
// of a passage to ground questions in. Same rules, one implementation — a
// second copy would drift, and the classification of what is retryable versus
// permanently unreadable was hard-won (image-heavy Docs exceed Google's export
// cap and throw rather than returning empty).

import { getDriveClient } from "@/lib/drive";
import mammoth from "mammoth";

export const GOOGLE_DOC = "application/vnd.google-apps.document";
export const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const TEXTLIKE = ["text/plain", "text/markdown", "text/csv"];

/** Can we get text out of this MIME type at all? PDFs and slides cannot. */
export function isExtractable(mime: string | null): boolean {
  return mime === GOOGLE_DOC || mime === DOCX || TEXTLIKE.includes(mime ?? "");
}

/**
 * Fetch a Drive file as plain text. Returns null when the type is unsupported.
 * Throws on transport/permission errors so callers can distinguish "can't read
 * this kind of file" from "couldn't reach Drive".
 */
export async function fetchDriveText(
  accessToken: string,
  fileId: string,
  mime: string | null,
): Promise<string | null> {
  const drive = getDriveClient(accessToken);

  if (mime === GOOGLE_DOC) {
    const res = await drive.files.export(
      { fileId, mimeType: "text/plain" },
      { responseType: "text" },
    );
    return typeof res.data === "string" ? res.data : String(res.data ?? "");
  }

  if (mime === DOCX) {
    const res = await drive.files.get({ fileId, alt: "media" }, { responseType: "arraybuffer" });
    const buffer = Buffer.from(res.data as ArrayBuffer);
    const { value } = await mammoth.extractRawText({ buffer });
    return value;
  }

  if (TEXTLIKE.includes(mime ?? "")) {
    const res = await drive.files.get({ fileId, alt: "media" }, { responseType: "text" });
    return typeof res.data === "string" ? res.data : String(res.data ?? "");
  }

  return null;
}
