const MAX_CHUNK_CHARS = 3200
const MIN_CHUNK_CHARS = 50

export type Chunk = { section_heading: string; content: string }

export function cleanContent(text: string): string {
  return text
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/!\[.*?\]\(.*?\)/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/&nbsp;/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function splitLong(heading: string, body: string): Chunk[] {
  const chunks: Chunk[] = []
  const paragraphs = body.split(/\n\n+/)
  let current = ""
  let subIndex = 0
  for (const para of paragraphs) {
    if ((current + "\n\n" + para).length > MAX_CHUNK_CHARS && current.length > MIN_CHUNK_CHARS) {
      chunks.push({
        section_heading: subIndex === 0 ? heading : `${heading} (suite ${subIndex})`,
        content: current.trim(),
      })
      current = para
      subIndex++
    } else {
      current = current ? current + "\n\n" + para : para
    }
  }
  if (current.length >= MIN_CHUNK_CHARS) {
    chunks.push({
      section_heading: subIndex === 0 ? heading : `${heading} (suite ${subIndex})`,
      content: current.trim(),
    })
  }
  return chunks
}

export function chunkText(raw: string): Chunk[] {
  const cleaned = cleanContent(raw)
  const sections = cleaned.split(/^##? /m)
  const chunks: Chunk[] = []
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i].trim()
    if (!section) continue
    let heading = "Introduction"
    let body = section
    if (i > 0) {
      const lines = section.split("\n")
      heading = lines[0].replace(/^#+\s*/, "").trim() || "Section"
      body = lines.slice(1).join("\n").trim()
    }
    if (body.length < MIN_CHUNK_CHARS) continue
    if (body.length > MAX_CHUNK_CHARS) {
      chunks.push(...splitLong(heading, body))
    } else {
      chunks.push({ section_heading: heading, content: body })
    }
  }
  if (chunks.length === 0 && cleaned.length >= MIN_CHUNK_CHARS) {
    chunks.push(...splitLong("Document", cleaned))
  }
  return chunks
}
