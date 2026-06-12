"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { authClient } from "@/lib/auth/client"
import { KeyRound } from "lucide-react"

export default function SetPasswordPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [invalid, setInvalid] = useState(false)
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const supabase = authClient()
    let cancelled = false

    async function establishSession() {
      // Flow 1 : lien au format token_hash (template email personnalisé)
      const params = new URLSearchParams(window.location.search)
      const tokenHash = params.get("token_hash")
      if (tokenHash) {
        const type = (params.get("type") || "invite") as "invite" | "recovery"
        const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
        if (cancelled) return
        if (!error) {
          setReady(true)
          return
        }
      }
      // Flow 2 : jetons dans le hash (#access_token…) — detectSessionInUrl
      // les consomme de façon asynchrone, on laisse plusieurs chances.
      for (let attempt = 0; attempt < 6; attempt++) {
        const { data } = await supabase.auth.getSession()
        if (cancelled) return
        if (data.session) {
          setReady(true)
          return
        }
        await new Promise((resolve) => setTimeout(resolve, 500))
      }
      if (!cancelled) setInvalid(true)
    }

    establishSession()
    return () => {
      cancelled = true
    }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 8) {
      setError("Le mot de passe doit contenir au moins 8 caractères.")
      return
    }
    if (password !== confirm) {
      setError("Les deux mots de passe ne correspondent pas.")
      return
    }
    setLoading(true)
    const { error: updateError } = await authClient().auth.updateUser({ password })
    if (updateError) {
      setError(updateError.message)
      setLoading(false)
      return
    }
    router.push("/dashboard")
    router.refresh()
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-4">
      <div className="mb-8 flex flex-col items-center gap-2">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-900">
          <KeyRound className="h-5 w-5 text-white" />
        </div>
        <h1 className="text-xl font-semibold text-zinc-900">Bienvenue chez Talika</h1>
        <p className="text-sm text-zinc-500">Choisissez votre mot de passe pour activer votre compte</p>
      </div>
      {invalid && (
        <p className="max-w-sm text-center text-sm text-red-600">
          Lien d&apos;invitation invalide ou expiré. Demandez une nouvelle invitation à votre administrateur.
        </p>
      )}
      {ready && (
        <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700">Nouveau mot de passe</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700">Confirmer le mot de passe</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-zinc-900 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
          >
            {loading ? "Activation…" : "Activer mon compte"}
          </button>
        </form>
      )}
      {!ready && !invalid && <p className="text-sm text-zinc-400">Vérification du lien…</p>}
    </div>
  )
}
