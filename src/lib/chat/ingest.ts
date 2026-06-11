import crypto from "node:crypto"
import { SupabaseClient } from "@supabase/supabase-js"
import { chunkText, Chunk } from "./chunking"
import { extractText } from "./extract"
import { embedTexts } from "./mistral"

function sha256(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex")
}

export async function insertChunks(
  db: SupabaseClient,
  documentId: string,
  chunks: Chunk[],
  metadata?: Record<string, unknown>
): Promise<number> {
  if (chunks.length === 0) return 0
  const texts = chunks.map((c) => `${c.section_heading}\n\n${c.content}`)
  const embeddings = await embedTexts(texts)
  const rows = chunks.map((c, i) => ({
    document_id: documentId,
    chunk_index: i,
    section_heading: c.section_heading,
    content: c.content,
    content_hash: sha256(`${documentId}|${c.section_heading}|${c.content}`),
    embedding: embeddings[i],
    metadata: metadata || {},
  }))
  const { error } = await db.from("kb_chunks").upsert(rows, { onConflict: "content_hash" })
  if (error) throw new Error(`kb_chunks insert failed: ${error.message}`)
  return rows.length
}

export async function ingestDocument(
  db: SupabaseClient,
  documentId: string
): Promise<{ chunkCount: number }> {
  const { data: doc, error: docError } = await db
    .from("kb_documents")
    .select("*")
    .eq("id", documentId)
    .single()
  if (docError || !doc) throw new Error("document introuvable")
  if (doc.source_type !== "upload" || !doc.storage_path) {
    throw new Error("seuls les documents uploadés peuvent être ingérés par cette route")
  }

  try {
    const { data: file, error: dlError } = await db.storage
      .from("kb-files")
      .download(doc.storage_path)
    if (dlError || !file) throw new Error(`téléchargement impossible: ${dlError?.message}`)

    const buffer = await file.arrayBuffer()
    const text = await extractText(buffer, doc.mime_type || "text/plain")
    if (!text || text.trim().length < 50) {
      throw new Error("aucun texte exploitable extrait du fichier")
    }

    await db.from("kb_chunks").delete().eq("document_id", documentId)
    const chunks = chunkText(text)
    const chunkCount = await insertChunks(db, documentId, chunks)

    await db
      .from("kb_documents")
      .update({
        status: "indexed",
        chunk_count: chunkCount,
        content_hash: sha256(text),
        error_message: null,
        indexed_at: new Date().toISOString(),
      })
      .eq("id", documentId)

    return { chunkCount }
  } catch (err) {
    await db
      .from("kb_documents")
      .update({ status: "error", error_message: (err as Error).message })
      .eq("id", documentId)
    throw err
  }
}
