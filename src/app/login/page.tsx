"use client"

import { useState, useEffect, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { authClient } from "@/lib/auth/client"
import { Lock } from "lucide-react"

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    // Filet de sécurité : les liens d'invitation/récupération Supabase peuvent
    // atterrir ici avec les jetons dans le hash — on les route vers set-password.
    const hash = window.location.hash
    if (hash.includes("access_token") && (hash.includes("type=invite") || hash.includes("type=recovery"))) {
      window.location.replace("/auth/set-password" + hash)
    }
  }, [])
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error: authError } = await authClient().auth.signInWithPassword({ email, password })
    if (authError) {
      setError("Identifiants incorrects. Vérifiez votre email et votre mot de passe.")
      setLoading(false)
      return
    }
    router.push(searchParams.get("next") || "/dashboard")
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-700">Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-700">Mot de passe</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-zinc-900 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
      >
        {loading ? "Connexion…" : "Se connecter"}
      </button>
    </form>
  )
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-4">
      <div className="mb-8 flex flex-col items-center gap-2">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-900">
          <Lock className="h-5 w-5 text-white" />
        </div>
        <h1 className="text-xl font-semibold text-zinc-900">Talika Admin</h1>
        <p className="text-sm text-zinc-500">Connectez-vous pour accéder au dashboard</p>
      </div>
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  )
}
