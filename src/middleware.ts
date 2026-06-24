import { NextResponse, type NextRequest } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { ROLE_SCOPE, isRequestAllowed } from "@/lib/roles"

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
  "/api/cron/",
  "/api/google/callback",
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

  // Sous-rôles (influence/sav) : ÉCRITURE dans leur espace, LECTURE partout
  // ailleurs (au moins la vue pour tout le monde), gestion d'équipe réservée admin.
  // admin / member ne sont pas dans ROLE_SCOPE → aucun cloisonnement.
  const role = (user.user_metadata?.role as string) || "member"
  if (!isRequestAllowed(pathname, request.method, role)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "accès non autorisé pour ce rôle" }, { status: 403 })
    }
    const url = request.nextUrl.clone()
    url.pathname = ROLE_SCOPE[role]?.home || "/dashboard"
    url.search = ""
    return NextResponse.redirect(url)
  }

  return response
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
}
