import { chatDb } from "@/lib/chat/db"
import { corsHeaders, handleOptions } from "@/lib/chat/cors"
import { getSettings } from "@/lib/chat/settings"
import { getOrCreateConversation, saveExchange } from "@/lib/chat/conversation"
import { checkRateLimits, clientIp } from "@/lib/chat/rate-limit"
import { embedTexts } from "@/lib/chat/mistral"
import { retrieveContext } from "@/lib/chat/rag"
import { buildSystemPrompt } from "@/lib/chat/prompt"
import { streamChatCompletion, ChatMessage } from "@/lib/chat/llm"
import { fallbackResponse, FALLBACK_MODEL } from "@/lib/chat/fallback"
import { parseMarkers, resolveProducts } from "@/lib/chat/products"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 60

const MAX_INPUT_LENGTH = 500
const HISTORY_SIZE = 8

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

export async function OPTIONS(request: Request) {
  return handleOptions(request)
}

export async function POST(request: Request) {
  const headers = {
    ...corsHeaders(request.headers.get("origin")),
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  }
  const encoder = new TextEncoder()

  let body: { token?: string; message?: string; page_url?: string; debug?: boolean }
  try {
    body = await request.json()
  } catch {
    return new Response(sse("error", { code: "bad_request", message: "JSON invalide" }), {
      status: 400,
      headers,
    })
  }

  const message = (body.message || "").trim().slice(0, MAX_INPUT_LENGTH)
  if (!body.token || !message) {
    return new Response(sse("error", { code: "bad_request", message: "token et message requis" }), {
      status: 400,
      headers,
    })
  }

  const db = chatDb()
  const started = Date.now()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) =>
        controller.enqueue(encoder.encode(sse(event, data)))

      try {
        const conversation = await getOrCreateConversation(db, { token: body.token })
        send("meta", { conversation_id: conversation.id })

        if (conversation.status === "human" || conversation.status === "queued") {
          await db.from("chat_messages").insert({
            conversation_id: conversation.id,
            role: "user",
            content: message,
          })
          const { data: conv } = await db
            .from("chat_conversations")
            .select("message_count, unread_count")
            .eq("id", conversation.id)
            .single()
          const humanUpdate: Record<string, unknown> = {
            message_count: (conv?.message_count || 0) + 1,
            unread_count: (conv?.unread_count || 0) + 1,
            last_message_at: new Date().toISOString(),
          }
          if (typeof body.page_url === "string" && body.page_url) {
            humanUpdate.last_page_url = body.page_url.slice(0, 500)
          }
          await db.from("chat_conversations").update(humanUpdate).eq("id", conversation.id)
          send("ack", {})
          send("done", { sources: [], status: conversation.status })
          controller.close()
          return
        }

        const settings = await getSettings(db, ["bot_enabled", "daily_limit", "prompt_addendum"])
        const dailyLimit = Number(settings.daily_limit) || 20

        let dailyRemaining: number | null = null
        if (!conversation.is_internal) {
          const limits = await checkRateLimits(db, conversation.token, clientIp(request), dailyLimit)
          if (!limits.allowed) {
            send("error", { code: limits.code, message: limits.message })
            controller.close()
            return
          }
          dailyRemaining = limits.dailyRemaining
        }

        if (settings.bot_enabled === false) {
          const fallback = fallbackResponse(message)
          await saveExchange(db, conversation.id, message, {
            content: fallback.response,
            model: FALLBACK_MODEL,
          })
          send("delta", { text: fallback.response })
          send("done", { sources: [], daily_remaining: dailyRemaining, status: "bot" })
          controller.close()
          return
        }

        try {
          const [embeddings, { data: historyRows }] = await Promise.all([
            embedTexts([message]),
            db
              .from("chat_messages")
              .select("role, content")
              .eq("conversation_id", conversation.id)
              .in("role", ["user", "assistant"])
              .order("created_at", { ascending: false })
              .limit(HISTORY_SIZE),
          ])

          const rag = await retrieveContext(db, embeddings[0])

          const history: ChatMessage[] = (historyRows || [])
            .reverse()
            .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }))

          const userContent = rag.contextBlock
            ? `Informations Talika disponibles (appuie-toi dessus sans mentionner leur source) :\n\n${rag.contextBlock}\n\nQuestion du visiteur : ${message}`
            : message

          const messages: ChatMessage[] = [
            { role: "system", content: buildSystemPrompt(settings.prompt_addendum as string) },
            ...history,
            { role: "user", content: userContent },
          ]

          const llm = await streamChatCompletion(messages)
          // On retient le flux jusqu'au premier "<<<" pour ne jamais montrer les
          // marqueurs (ASK_EMAIL / PRODUCTS) au visiteur ; ils sont toujours en fin.
          let buffer = ""
          let emitted = 0
          for await (const delta of llm.deltas) {
            buffer += delta
            const markerIdx = buffer.indexOf("<<<")
            const safeEnd = markerIdx === -1 ? buffer.length : markerIdx
            if (safeEnd > emitted) {
              send("delta", { text: buffer.slice(emitted, safeEnd) })
              emitted = safeEnd
            }
          }

          const final = llm.getFinal()
          const parsed = parseMarkers(final.content || buffer)
          // Émettre le reste de texte propre non encore envoyé (cas d'un "<<<" qui
          // n'était finalement pas un marqueur, ou texte après marqueur retiré).
          if (parsed.text.length > emitted) {
            send("delta", { text: parsed.text.slice(emitted) })
          }

          const productRefs = await resolveProducts(db, parsed.handles)
          if (productRefs.length > 0) {
            send("products", productRefs)
          }

          await saveExchange(db, conversation.id, message, {
            content: parsed.text,
            model: llm.model,
            tokensUsed: final.tokensUsed,
            ragSources: rag.sources,
            productRefs: productRefs.length > 0 ? productRefs : null,
          })

          const done: Record<string, unknown> = {
            sources: rag.sources.map((s) => ({ title: s.title, similarity: s.similarity })),
            daily_remaining: dailyRemaining,
            status: "bot",
            ask_email: parsed.askEmail,
          }
          if (body.debug && conversation.is_internal) {
            done.debug = {
              chunks: rag.chunks.map((c) => ({
                title: c.title,
                section_heading: c.section_heading,
                similarity: c.similarity,
                content: c.content.slice(0, 300),
              })),
              tokens_used: final.tokensUsed,
              latency_ms: Date.now() - started,
              model: llm.model,
            }
          }
          send("done", done)
        } catch (llmError) {
          console.error("chat LLM error:", llmError)
          const fallback = fallbackResponse(message)
          await saveExchange(db, conversation.id, message, {
            content: fallback.response,
            model: FALLBACK_MODEL,
          })
          send("delta", { text: fallback.response })
          send("done", { sources: [], daily_remaining: dailyRemaining, status: "bot", model: FALLBACK_MODEL })
        }
        controller.close()
      } catch (err) {
        send("error", { code: "server_error", message: (err as Error).message })
        controller.close()
      }
    },
  })

  return new Response(stream, { headers })
}
