import crypto from "node:crypto"
import { SupabaseClient } from "@supabase/supabase-js"
import { RagSource } from "./rag"

export type Conversation = {
  id: string
  token: string
  status: "bot" | "human" | "queued" | "closed"
  is_internal: boolean
  message_count: number
}

export async function getOrCreateConversation(
  db: SupabaseClient,
  opts: { token?: string | null; pageUrl?: string | null; userAgent?: string | null; isInternal?: boolean }
): Promise<Conversation> {
  if (opts.token) {
    const { data } = await db
      .from("chat_conversations")
      .select("id, token, status, is_internal, message_count")
      .eq("token", opts.token)
      .single()
    if (data) {
      if (data.status === "closed") {
        await db
          .from("chat_conversations")
          .update({ status: "bot", closed_at: null })
          .eq("id", data.id)
        data.status = "bot"
      }
      return data as Conversation
    }
  }
  const token = crypto.randomBytes(16).toString("hex")
  const { data, error } = await db
    .from("chat_conversations")
    .insert({
      token,
      first_page_url: opts.pageUrl || null,
      user_agent: opts.userAgent || null,
      is_internal: opts.isInternal || false,
    })
    .select("id, token, status, is_internal, message_count")
    .single()
  if (error || !data) throw new Error(`conversation insert failed: ${error?.message}`)
  return data as Conversation
}

export async function saveExchange(
  db: SupabaseClient,
  conversationId: string,
  userMessage: string,
  assistant: {
    content: string
    model: string | null
    tokensUsed?: number | null
    ragSources?: RagSource[] | null
    productRefs?: unknown[] | null
  } | null
): Promise<void> {
  const rows: Record<string, unknown>[] = [
    { conversation_id: conversationId, role: "user", content: userMessage },
  ]
  if (assistant) {
    rows.push({
      conversation_id: conversationId,
      role: "assistant",
      content: assistant.content,
      model: assistant.model,
      tokens_used: assistant.tokensUsed || null,
      rag_sources: assistant.ragSources && assistant.ragSources.length > 0 ? assistant.ragSources : null,
      product_refs: assistant.productRefs && assistant.productRefs.length > 0 ? assistant.productRefs : null,
    })
  }
  await db.from("chat_messages").insert(rows)
  const { data: conv } = await db
    .from("chat_conversations")
    .select("message_count, unread_count")
    .eq("id", conversationId)
    .single()
  await db
    .from("chat_conversations")
    .update({
      message_count: (conv?.message_count || 0) + rows.length,
      unread_count: (conv?.unread_count || 0) + 1,
      last_message_at: new Date().toISOString(),
    })
    .eq("id", conversationId)
}
