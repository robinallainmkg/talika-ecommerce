// Client de l'API Conversations Klaviyo (lecture des conversations WhatsApp + envoi).
//
// Auth — la doc dit « Only OAuth access tokens are supported », mais le test du 24/07/2026
// sur le compte FR contredit la doc pour la lecture :
//   GET  /api/profiles/{id}/conversations  avec KLAVIYO_API_KEY -> HTTP 200
//   POST /api/conversation-messages        avec KLAVIYO_API_KEY -> HTTP 403 permission_denied
// Stratégie : lecture avec la clé privée (fallback OAuth si configuré), envoi = OAuth
// obligatoire (app Klaviyo « Manage Apps » + refresh token, comme Google Ads, CLAUDE.md §13).
// Scopes : accounts:read conversations:read conversations:write profiles:read.
//
// ⚠️ Il n'existe AUCUN webhook Klaviyo pour un message WhatsApp entrant (topics du compte
// relevés le 24/07/2026). La doc le dit : « you will need to poll Get Conversation for
// Profile ». D'où l'architecture watchlist + polling (voir /api/cron/whatsapp-poll).
//
// ⚠️ Forme de réponse NON confirmée : le spec OpenAPI (2026-07-15) ne déclare que
// `channel` comme attribut d'une conversation — aucun endpoint stable ne rend le CORPS
// des messages — alors que la page d'overview parle de « full conversation thread ».
// Le compte n'ayant encore aucune conversation (data:[] au 24/07), impossible de trancher
// avant le premier message entrant réel. Le parseur ci-dessous est donc défensif et
// getWhatsappConversation() peut ne rendre que l'id + le canal.

const REVISION = "2026-07-15" // révision qui rend `conversations` pluriel + multi-canal

type TokenCache = { accessToken: string; expiresAt: number }
let cache: TokenCache | null = null

/** Échange le refresh token contre un access token (1 h de validité, mis en cache). */
export async function getAccessToken(): Promise<string | null> {
  const clientId = process.env.KLAVIYO_OAUTH_CLIENT_ID
  const clientSecret = process.env.KLAVIYO_OAUTH_CLIENT_SECRET
  const refreshToken = process.env.KLAVIYO_OAUTH_REFRESH_TOKEN
  if (!clientId || !clientSecret || !refreshToken) return null
  if (cache && cache.expiresAt > Date.now() + 60_000) return cache.accessToken

  const response = await fetch("https://a.klaviyo.com/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
    cache: "no-store",
  })
  if (!response.ok) return null
  const json = (await response.json()) as { access_token?: string; expires_in?: number }
  if (!json.access_token) return null
  cache = {
    accessToken: json.access_token,
    expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
  }
  return cache.accessToken
}

export function isConversationsConfigured(): boolean {
  return Boolean(
    process.env.KLAVIYO_OAUTH_CLIENT_ID &&
      process.env.KLAVIYO_OAUTH_CLIENT_SECRET &&
      process.env.KLAVIYO_OAUTH_REFRESH_TOKEN
  )
}

/**
 * Requête authentifiée. Lecture : clé privée acceptée (testé 200 le 24/07/2026),
 * OAuth utilisé s'il est configuré. Écriture : OAuth exigé (clé privée -> 403, testé).
 */
async function apiFetch(
  path: string,
  init?: RequestInit,
  auth: "read" | "write" = "read"
): Promise<Response | null> {
  let authorization: string | null = null
  const oauthToken = isConversationsConfigured() ? await getAccessToken() : null
  if (oauthToken) authorization = `Bearer ${oauthToken}`
  else if (auth === "read" && process.env.KLAVIYO_API_KEY)
    authorization = `Klaviyo-API-Key ${process.env.KLAVIYO_API_KEY}`
  if (!authorization) return null

  return fetch(`https://a.klaviyo.com/api/${path}`, {
    ...init,
    headers: {
      ...(init?.headers || {}),
      Authorization: authorization,
      revision: REVISION,
      accept: "application/json",
    },
    cache: "no-store",
  })
}

export type ConversationMessage = {
  id: string
  body: string
  /** `inbound` = la cliente écrit. `outbound` = nous. */
  direction: "inbound" | "outbound"
  createdAt: string
}

export type Conversation = {
  id: string
  channel: "sms" | "whatsapp" | "instagram"
  /** Vide tant que Klaviyo n'expose pas les corps de messages (cf. en-tête du fichier). */
  messages: ConversationMessage[]
  /** Payload brut de la ressource, journalisé pour découvrir la vraie forme de réponse. */
  raw: unknown
}

/**
 * Récupère la conversation WhatsApp d'un profil.
 * Rate limit Klaviyo : tier SMALL (3 req/s en burst, 60 req/min en régime) —
 * c'est ce plafond qui dimensionne la cadence de polling.
 */
export async function getWhatsappConversation(profileId: string): Promise<Conversation | null> {
  const response = await apiFetch(`profiles/${profileId}/conversations`)
  if (!response || !response.ok) return null
  const json = (await response.json()) as {
    data?: Array<{
      id: string
      attributes?: { channel?: string; messages?: Array<Record<string, string>> }
    }>
  }
  const whatsapp = (json.data || []).find((c) => c.attributes?.channel === "whatsapp")
  if (!whatsapp) return null
  // Le spec ne documente pas de messages dans les attributs ; on parse quand même au cas
  // où la réponse réelle serait plus riche que le spec, sinon la liste reste vide.
  const messages = (whatsapp.attributes?.messages || []).map((m) => ({
    id: m.id,
    body: m.body ?? "",
    direction: (m.direction === "inbound" ? "inbound" : "outbound") as "inbound" | "outbound",
    createdAt: m.created ?? m.created_at ?? "",
  }))
  return { id: whatsapp.id, channel: "whatsapp", messages, raw: whatsapp }
}

/**
 * Envoie une réponse dans la fenêtre de service de 24 h ouverte par la cliente.
 * ⚠️ N'appeler QUE depuis une action explicitement validée par un humain.
 * Hors fenêtre de 24 h, Meta refuse le message libre : il faudrait un template approuvé.
 */
export async function sendConversationMessage(
  conversationId: string,
  body: string
): Promise<{ ok: boolean; id?: string; error?: string }> {
  if (!isConversationsConfigured()) {
    // La clé privée renvoie 403 sur cet endpoint (testé le 24/07/2026) : inutile d'essayer.
    return { ok: false, error: "OAuth Klaviyo non configuré (requis pour l'envoi)" }
  }
  const response = await apiFetch(
    "conversation-messages",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data: {
          type: "conversation-message",
          attributes: { body },
          relationships: { conversation: { data: { type: "conversation", id: conversationId } } },
        },
      }),
    },
    "write"
  )
  if (!response) return { ok: false, error: "OAuth Klaviyo non configuré" }
  if (!response.ok) return { ok: false, error: `Klaviyo ${response.status}: ${await response.text()}` }
  // L'id du message créé sert d'external_id local : sans lui, le prochain poll
  // réinsérerait notre propre réponse en DOUBLON quand elle revient de l'API.
  const json = (await response.json().catch(() => null)) as { data?: { id?: string } } | null
  return { ok: true, id: json?.data?.id }
}
