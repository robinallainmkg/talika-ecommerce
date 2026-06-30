"use client"

import { useRef, useState } from "react"
import { X, Send, Eye, Loader2, Users } from "lucide-react"
import { TEMPLATES, MERGE_VARS, mergeTemplate } from "@/lib/influence/templates"

interface Props {
  ids: string[]
  names: string[]
  onClose: () => void
  onDone: (results: { id: string; result: string }[]) => void
}

export function OutreachCompose({ ids, names, onClose, onDone }: Props) {
  const [tplKey, setTplKey] = useState(TEMPLATES[0].key)
  const [subject, setSubject] = useState(TEMPLATES[0].subject)
  const [body, setBody] = useState(TEMPLATES[0].body)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState("")
  const [preview, setPreview] = useState<{ subject: string; text: string } | null>(null)
  const bodyRef = useRef<HTMLTextAreaElement>(null)

  const applyTemplate = (key: string) => {
    setTplKey(key)
    setPreview(null)
    const t = TEMPLATES.find((x) => x.key === key)
    if (t) { setSubject(t.subject); setBody(t.body) }
    else { setSubject("Talika x {first_name}"); setBody("Hi {first_name},\n\n") }
  }

  const insertVar = (v: string) => {
    const el = bodyRef.current
    const token = `{${v}}`
    if (!el) { setBody((b) => b + token); return }
    const s = el.selectionStart ?? body.length
    const e = el.selectionEnd ?? body.length
    const next = body.slice(0, s) + token + body.slice(e)
    setBody(next)
    requestAnimationFrame(() => { el.focus(); el.selectionStart = el.selectionEnd = s + token.length })
  }

  const sampleVars = (): Record<string, string> => {
    const fn = (names[0] || "there").trim().split(/\s+/)[0]
    return { first_name: fn, name: names[0] || "", handle: "yourhandle", sender: "Robin · Talika UK", personalisation: "" }
  }
  const doPreview = () => {
    const v = sampleVars()
    setPreview({ subject: mergeTemplate(subject, v), text: mergeTemplate(body, v) })
  }

  const send = async (dry: boolean) => {
    if (!dry && !confirm(`Envoyer POUR DE VRAI à ${ids.length} contact(s) ? Les variables seront fusionnées par destinataire.`)) return
    setBusy(true); setNote("")
    try {
      const res = await fetch("/api/influencers/outreach/compose", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ influencer_ids: ids, subject, body, dry }),
      })
      const j = await res.json()
      if (!res.ok) { setNote(j.error || "Erreur"); return }
      const skips = (j.results || []).filter((r: { result: string }) => r.result === "skip").length
      setNote(`${dry ? "Aperçu DRY" : "Envoyé"} : ${j.sent}/${j.attempted}${skips ? ` · ${skips} sans email (ignoré)` : ""}`)
      if (!dry) onDone(j.results || [])
    } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-zinc-900">
            <Send className="h-4 w-4" /> Outreach — {ids.length} contact{ids.length > 1 ? "s" : ""}
          </h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-700"><X className="h-5 w-5" /></button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          <div className="flex items-start gap-2 rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-500">
            <Users className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="line-clamp-2">{names.slice(0, 8).join(", ")}{names.length > 8 ? ` +${names.length - 8}` : ""}</span>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">Template</label>
            <select value={tplKey} onChange={(e) => applyTemplate(e.target.value)} className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm">
              {TEMPLATES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
              <option value="blank">Vierge</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">Objet</label>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm" />
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-xs font-medium text-zinc-600">Message</label>
              <div className="flex flex-wrap gap-1">
                {MERGE_VARS.map((v) => (
                  <button key={v} type="button" onClick={() => insertVar(v)}
                    className="rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] font-medium text-zinc-600 hover:bg-zinc-200">
                    {`{${v}}`}
                  </button>
                ))}
              </div>
            </div>
            <textarea ref={bodyRef} value={body} onChange={(e) => setBody(e.target.value)} rows={12}
              className="w-full resize-y rounded-lg border border-zinc-300 px-3 py-2 font-mono text-[13px] leading-relaxed focus:border-zinc-900 focus:outline-none" />
            <p className="mt-1 text-[11px] text-zinc-400">Variables fusionnées à l&apos;envoi pour chaque destinataire. {`{first_name}`} = prénom.</p>
          </div>

          {preview && (
            <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3">
              <p className="text-[11px] font-medium text-blue-700">Aperçu (1er destinataire) — Objet : {preview.subject}</p>
              <pre className="mt-1 whitespace-pre-wrap font-sans text-[13px] text-zinc-700">{preview.text}</pre>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-zinc-200 px-5 py-3">
          <button onClick={doPreview} className="flex items-center gap-1.5 rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50">
            <Eye className="h-4 w-4" /> Aperçu
          </button>
          <button onClick={() => send(false)} disabled={busy || !body.trim()}
            className="flex items-center gap-1.5 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Envoyer à {ids.length}
          </button>
          {note && <span className="text-sm text-zinc-600">{note}</span>}
        </div>
      </div>
    </div>
  )
}
