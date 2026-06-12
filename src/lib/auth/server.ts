import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { User } from "@supabase/supabase-js"

export async function getSessionUser(): Promise<User | null> {
  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll() {},
      },
    }
  )
  const { data } = await supabase.auth.getUser()
  return data.user
}

export async function requireAdminUser(): Promise<{ user: User } | { error: string; status: number }> {
  const user = await getSessionUser()
  if (!user) return { error: "non authentifié", status: 401 }
  if (user.user_metadata?.role !== "admin") return { error: "réservé aux administrateurs", status: 403 }
  return { user }
}
