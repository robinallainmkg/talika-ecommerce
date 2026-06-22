"use client"

import { useCallback, useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { UserPlus, Trash2, ShieldCheck, Mail } from "lucide-react"

type UserRow = {
  id: string
  email: string
  name: string | null
  role: string
  created_at: string
  last_sign_in_at: string | null
}

export default function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState<string>("influence")
  const [inviting, setInviting] = useState(false)
  const [feedback, setFeedback] = useState<{ type: "ok" | "error"; text: string } | null>(null)
  const [inviteLink, setInviteLink] = useState<string | null>(null)
  const [linkCopied, setLinkCopied] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch("/api/users")
    if (res.status === 403 || res.status === 401) {
      setForbidden(true)
      setLoading(false)
      return
    }
    const data = await res.json()
    setUsers(data.users || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    if (!inviteEmail.trim()) return
    setInviting(true)
    setFeedback(null)
    setInviteLink(null)
    setLinkCopied(false)
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
    })
    const data = await res.json()
    if (res.ok && data.email_sent) {
      setFeedback({ type: "ok", text: `Invitation envoyée à ${inviteEmail.trim()} — la personne recevra un email pour activer son compte.` })
      setInviteEmail("")
      load()
    } else if (res.ok && data.invite_link) {
      setFeedback({
        type: "ok",
        text: `Compte créé pour ${inviteEmail.trim()} — copiez ce lien d'activation et envoyez-le à la personne (Slack, email perso… valable 24 h) :`,
      })
      setInviteLink(data.invite_link)
      setInviteEmail("")
      load()
    } else {
      setFeedback({ type: "error", text: data.error || "Invitation impossible." })
    }
    setInviting(false)
  }

  async function handleDelete(user: UserRow) {
    if (!confirm(`Supprimer l'accès de ${user.email} ?`)) return
    const res = await fetch(`/api/users?id=${user.id}`, { method: "DELETE" })
    if (res.ok) load()
  }

  if (forbidden) {
    return (
      <div className="p-8">
        <p className="text-sm text-zinc-500">Cette page est réservée aux administrateurs.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-8">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900">Équipe</h1>
        <p className="text-sm text-zinc-500">Accès au dashboard Talika — invitations par lien d’activation</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UserPlus className="h-4 w-4" /> Inviter un membre
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleInvite} className="flex flex-wrap items-center gap-3">
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="prenom@talika.com"
              required
              className="w-72 rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none"
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
            >
              <option value="influence">Influence (espace influence seul)</option>
              <option value="sav">SAV (chat seul)</option>
              <option value="member">Membre (accès complet)</option>
              <option value="admin">Administrateur</option>
            </select>
            <button
              type="submit"
              disabled={inviting}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
            >
              {inviting ? "Génération…" : "Générer l'invitation"}
            </button>
          </form>
          {feedback && (
            <p className={`mt-3 text-sm ${feedback.type === "ok" ? "text-emerald-600" : "text-red-600"}`}>
              {feedback.text}
            </p>
          )}
          {inviteLink && (
            <div className="mt-2 flex items-center gap-2">
              <input
                readOnly
                value={inviteLink}
                onFocus={(e) => e.target.select()}
                className="w-full max-w-xl rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-xs text-zinc-700"
              />
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(inviteLink)
                  setLinkCopied(true)
                  setTimeout(() => setLinkCopied(false), 2000)
                }}
                className="shrink-0 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
              >
                {linkCopied ? "Copié !" : "Copier le lien"}
              </button>
            </div>
          )}
          <p className="mt-2 text-xs text-zinc-400">
            Génère un lien d’activation à transmettre à la personne (le service email Supabase n’est pas fiable vers les adresses @talika.com). Un administrateur peut inviter et révoquer des membres ; un membre a accès à tout le dashboard sans gérer l’équipe.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Membres ({users.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-zinc-400">Chargement…</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-xs uppercase text-zinc-400">
                  <th className="pb-2">Email</th>
                  <th className="pb-2">Rôle</th>
                  <th className="pb-2">Dernière connexion</th>
                  <th className="pb-2"></th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-zinc-100">
                    <td className="py-3">
                      <span className="flex items-center gap-2 text-zinc-900">
                        <Mail className="h-3.5 w-3.5 text-zinc-400" /> {u.email}
                      </span>
                    </td>
                    <td className="py-3">
                      {u.role === "admin" ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-zinc-900 px-2 py-0.5 text-xs text-white">
                          <ShieldCheck className="h-3 w-3" /> Admin
                        </span>
                      ) : (
                        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
                          {u.role === "influence" ? "Influence" : u.role === "sav" ? "SAV" : "Membre"}
                        </span>
                      )}
                    </td>
                    <td className="py-3 text-zinc-500">
                      {u.last_sign_in_at
                        ? new Date(u.last_sign_in_at).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })
                        : "Invitation en attente"}
                    </td>
                    <td className="py-3 text-right">
                      <button
                        onClick={() => handleDelete(u)}
                        className="rounded p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600"
                        title="Révoquer l'accès"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
