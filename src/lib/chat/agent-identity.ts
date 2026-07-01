import { cookies } from "next/headers"
import { createServerClient } from "@supabase/ssr"

// Email de l'agent connecté (session Supabase du backoffice), pour l'attribution
// des prises en main / réponses SAV (ex. contact@talika.com = Meha).
// Les routes admin passent par le middleware (session obligatoire) → le cookie
// est toujours présent ; null seulement en cas d'appel hors navigateur.
export async function agentEmail(): Promise<string | null> {
  try {
    const cookieStore = cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll() {
            /* lecture seule : pas de refresh de cookie dans une route admin */
          },
        },
      }
    )
    const {
      data: { user },
    } = await supabase.auth.getUser()
    return user?.email || null
  } catch {
    return null
  }
}
