import { NextResponse, type NextRequest } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { isRequestAllowed, homeFor } from "@/lib/roles"

// Chemins accessibles sans session :
// - widget public (talika.fr) : bootstrap, message, messages, escalate, order-lookup
// - cron Vercel (protégé par CRON_SECRET dans la route)
// - callback OAuth Google Ads (protégé par son flow)
// - pages d'auth et assets
const PUBLIC_PREFIXES = [
  "/login",
  "/auth/",
  "/api/chat/bootstrap",
  "/api/chat/message",
  "/api/chat/messages",
  "/api/chat/escalate",
  "/api/chat/order-lookup",
  "/api/chat/code-lookup",
  "/api/chat/email",
  "/api/cron/",
  "/api/google/callback",
  // OAuth Klaviyo (WhatsApp) : start = CRON_SECRET, callback = state + PKCE.
  // Le retour de Klaviyo arrive sans session Supabase, il doit passer le middleware.
  "/api/whatsapp/oauth/",
  // TEMPORAIRE — revue des conversations chat partagée avec une relectrice
  // externe (page noindex, emails masqués). À retirer après la revue.
  "/revue-chat",
  "/api/revue-chat",
]

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p))
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (isPublic(pathname)) return NextResponse.next()

  let response = NextResponse.next({ request })
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "non authentifié" }, { status: 401 })
    }
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    url.searchParams.set("next", pathname)
    return NextResponse.redirect(url)
  }

  // Accès modulable : pages + écritures filtrées par SECTIONS effectives de la
  // personne (override user_metadata.sections sinon preset du rôle). admin = tout.
  // GET ouvert (vue), gestion d'équipe réservée admin. Cf. src/lib/roles.ts.
  const role = (user.user_metadata?.role as string) || "member"
  const sections = user.user_metadata?.sections
  if (!isRequestAllowed(pathname, request.method, role, sections)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "accès non autorisé pour ce rôle" }, { status: 403 })
    }
    const url = request.nextUrl.clone()
    url.pathname = homeFor(role, sections)
    url.search = ""
    return NextResponse.redirect(url)
  }

  return response
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
}
