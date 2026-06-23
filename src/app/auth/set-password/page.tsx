"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { authClient } from "@/lib/auth/client"
import { KeyRound } from "lucide-react"

export default function SetPasswordPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [invalid, setInvalid] = useState(false)
  const [hasSession, setHasSession] = useState(false)
  const [tokenHash, setTokenHash] = useState<string | null>(null)
  const [tokenType, setTokenType] = useState<"invite" | "recovery">("invite")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // IMPORTANT : on NE consomme PAS le jeton au chargement. Les boîtes
  // Microsoft/Outlook (Safe Links) pré-ouvrent les liens pour les « scanner »,
  // ce qui grillait le jeton à usage unique AVANT le clic humain → « lien
  // expiré ». Idem au moindre rechargement. On affiche donc le formulaire tout
  // de suite et on ne consomme le jeton qu'à la validation du mot de passe.
  useEffect(() => {
    const supabase = authClient()
    let cancelled = false

    async function prepare() {
      const params = new URLSearchParams(window.location.search)
      const th = params.get("token_hash")
      const type = (params.get("type") || "invite") as "invite" | "recovery"

      // Une session déjà ouverte (lien déjà activé dans un autre onglet, etc.) suffit.
      const { data } = await supabase.auth.getSession()
      if (cancelled) return
      if (data.session) {
        setHasSession(true)
        setReady(true)
        return
      }
      if (th) {
        // Lien token_hash (notre email custom) : on montre le formulaire, le
        // jeton sera consommé au submit seulement.
        setTokenHash(th)
        setTokenType(type)
        setReady(true)
        return
      }
      // Fallback : jetons dans le hash (#access_token…) consommés de façon
      // asynchrone par detectSessionInUrl — on laisse plusieurs chances.
      for (let attempt = 0; attempt < 6; attempt++) {
        const res = await supabase.auth.getSession()
        if (cancelled) return
        if (res.data.session) {
          setHasSession(true)
          setReady(true)
          return
        }
        await new Promise((resolve) => setTimeout(resolve, 500))
      }
      if (!cancelled) setInvalid(true)
    }

    prepare()
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
    const supabase = authClient()

    // 1) Ouvrir une session si on n'en a pas déjà une — c'est ICI qu'on consomme
    //    le jeton (et pas au chargement, cf. commentaire plus haut).
    if (!hasSession && tokenHash) {
      const { error: otpError } = await supabase.auth.verifyOtp({ type: tokenType, token_hash: tokenHash })
      if (otpError) {
        // Le jeton a peut-être été consommé entre-temps mais une session existe
        // déjà → on revérifie avant d'abandonner.
        const { data } = await supabase.auth.getSession()
        if (!data.session) {
          setError(
            "Ce lien a déjà été utilisé ou a expiré. Demandez une nouvelle invitation à votre administrateur."
          )
          setLoading(false)
          return
        }
      }
    }

    // 2) Poser le mot de passe sur la session ouverte.
    const { error: updateError } = await supabase.auth.updateUser({ password })
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
