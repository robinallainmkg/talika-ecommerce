import matter from "gray-matter"

export async function extractText(buffer: ArrayBuffer, mimeType: string): Promise<string> {
  if (mimeType === "application/pdf") {
    const { extractText: unpdfExtract, getDocumentProxy } = await import("unpdf")
    const pdf = await getDocumentProxy(new Uint8Array(buffer))
    const { text } = await unpdfExtract(pdf, { mergePages: true })
    return text
  }
  if (
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    const mammoth = await import("mammoth")
    const result = await mammoth.extractRawText({ buffer: Buffer.from(buffer) })
    return result.value
  }
  const raw = Buffer.from(buffer).toString("utf-8")
  if (mimeType === "text/markdown") {
    return matter(raw).content
  }
  return raw
}

export const ALLOWED_KB_MIMES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/markdown",
  "text/plain",
]
