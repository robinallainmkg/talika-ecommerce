"use client"

import { Fragment, useCallback, useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { UserPlus, Trash2, ShieldCheck, Mail, SlidersHorizontal, Check, X } from "lucide-react"
import { SECTIONS, GRANTABLE_SECTIONS, ROLE_PRESET, ROLE_LABELS, ASSIGNABLE_ROLES } from "@/lib/roles"

type UserRow = {
  id: string
  email: string
  name: string | null
  role: string
  sections: string[] | null
  created_at: string
  last_sign_in_at: string | null
}

const SECTION_OPTIONS = SECTIONS.filter((s) => GRANTABLE_SECTIONS.includes(s.key))

// Sections effectives affichées = override explicite sinon preset du rôle.
const effectiveSections = (u: UserRow): string[] =>
  u.role === "admin" ? GRANTABLE_SECTIONS : u.sections ?? ROLE_PRESET[u.role] ?? GRANTABLE_SECTIONS

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

  // Édition d'accès en ligne (rôle + sections) par personne.
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftRole, setDraftRole] = useState<string>("member")
  const [draftSections, setDraftSections] = useState<string[]>([])
  const [savingId, setSavingId] = useState<string | null>(null)

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

  function openEditor(u: UserRow) {
    setEditingId(u.id)
    setDraftRole(u.role)
    setDraftSections(effectiveSections(u))
  }

  // Changer de rôle ré-initialise les cases sur le preset du rôle (puis ajustable).
  function changeRole(role: string) {
    setDraftRole(role)
    setDraftSections(role === "admin" ? GRANTABLE_SECTIONS : ROLE_PRESET[role] ?? GRANTABLE_SECTIONS)
  }

  function toggleSection(key: string) {
    setDraftSections((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))
  }

  async function saveAccess(id: string) {
    setSavingId(id)
    setFeedback(null)
    const res = await fetch("/api/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, role: draftRole, sections: draftSections }),
    })
    const data = await res.json()
    setSavingId(null)
    if (res.ok) {
      setEditingId(null)
      load()
      setFeedback({ type: "ok", text: "Accès mis à jour." })
    } else {
      setFeedback({ type: "error", text: data.error || "Mise à jour impossible." })
    }
  }

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
    const emailVal = inviteEmail.trim()
    if (res.ok && data.invite_link) {
      setInviteLink(data.invite_link)
      setInviteEmail("")
      load()
      setFeedback(
        data.email_sent
          ? { type: "ok", text: `Invitation envoyée par email à ${emailVal}. Un lien de secours reste dispo ci-dessous au cas où.` }
          : { type: "ok", text: `Compte créé pour ${emailVal} — copiez ce lien d'activation et envoyez-le (Slack, email perso… valable 24 h) :` }
      )
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
        <h1 className="text-2xl font-semibold text-zinc-900">Équipe &amp; accès</h1>
        <p className="text-sm text-zinc-500">Invite, attribue un rôle, puis affine au cas par cas les sections que chacun voit.</p>
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
            Le rôle ne fait qu&apos;initialiser l&apos;accès — tu peux ensuite cocher précisément les sections de chaque personne via « Gérer l&apos;accès ». Admin = tout + gestion d&apos;équipe (non restreignable).
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
                  <th className="pb-2">Accès</th>
                  <th className="pb-2">Dernière connexion</th>
                  <th className="pb-2"></th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const eff = effectiveSections(u)
                  const editing = editingId === u.id
                  return (
                    <Fragment key={u.id}>
                      <tr className="border-b border-zinc-100">
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
                              {ROLE_LABELS[u.role] ?? u.role}
                            </span>
                          )}
                        </td>
                        <td className="py-3 text-zinc-500">
                          {u.role === "admin"
                            ? <span className="text-zinc-400">Tout</span>
                            : eff.length === GRANTABLE_SECTIONS.length
                              ? "Tout"
                              : `${eff.length} section${eff.length > 1 ? "s" : ""}`}
                        </td>
                        <td className="py-3 text-zinc-500">
                          {u.last_sign_in_at
                            ? new Date(u.last_sign_in_at).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })
                            : "Invitation en attente"}
                        </td>
                        <td className="py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => (editing ? setEditingId(null) : openEditor(u))}
                              className={`rounded p-1.5 ${editing ? "bg-zinc-900 text-white" : "text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"}`}
                              title="Gérer l'accès"
                            >
                              <SlidersHorizontal className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(u)}
                              className="rounded p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600"
                              title="Révoquer l'accès"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                      {editing && (
                        <tr className="border-b border-zinc-100 bg-zinc-50/70">
                          <td colSpan={5} className="px-1 py-4">
                            <div className="space-y-3 rounded-lg border border-zinc-200 bg-white p-4">
                              <div className="flex flex-wrap items-center gap-3">
                                <label className="text-xs font-medium text-zinc-600">Rôle (preset)</label>
                                <select value={draftRole} onChange={(e) => changeRole(e.target.value)}
                                  className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm">
                                  {ASSIGNABLE_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                                </select>
                                <span className="text-xs text-zinc-400">Choisir un rôle coche les sections par défaut — affine ensuite ci-dessous.</span>
                              </div>

                              {draftRole === "admin" ? (
                                <p className="text-sm text-zinc-500">Administrateur : accès complet à toutes les sections + gestion d&apos;équipe (non restreignable).</p>
                              ) : (
                                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                                  {SECTION_OPTIONS.map((s) => {
                                    const on = draftSections.includes(s.key)
                                    return (
                                      <button key={s.key} type="button" onClick={() => toggleSection(s.key)}
                                        className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${on ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"}`}>
                                        <span className={`flex h-4 w-4 items-center justify-center rounded ${on ? "bg-white/20" : "border border-zinc-300"}`}>
                                          {on && <Check className="h-3 w-3" />}
                                        </span>
                                        {s.label}
                                      </button>
                                    )
                                  })}
                                </div>
                              )}

                              <div className="flex items-center justify-end gap-2 pt-1">
                                <button onClick={() => setEditingId(null)}
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50">
                                  <X className="h-3.5 w-3.5" /> Annuler
                                </button>
                                <button onClick={() => saveAccess(u.id)} disabled={savingId === u.id}
                                  className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50">
                                  {savingId === u.id ? "Enregistrement…" : "Enregistrer l'accès"}
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
