"use client"

import { useCallback, useEffect, useState } from "react"

// Revue publique temporaire des conversations du chat (2-3 juillet 2026).
// Reproduit le design du widget client (navy/bleu signature/crème/or) et
// permet à la relectrice de laisser des notes (stockées via /api/revue-chat).

type ProductRef = { title?: string; price?: string; currency?: string; url?: string }
type Msg = { role: string; content: string; product_refs: ProductRef[] | null; created_at: string }
type Conv = {
  id: string
  status: string
  email_masked: string | null
  orders_count: number
  created_at: string
  messages: Msg[]
}
type Note = { author: string; conv_id: string | null; text: string; at: string }

// Repères ◆ posés sur des messages précis (identifiés par conv + début du contenu).
const FLAGS: { n: number; conv: string; prefix: string; resolved?: boolean }[] = [
  { n: 1, conv: "90536e61-e5ba-4f03-9659-62f844e86b76", prefix: "Avec plaisir ! Il semble", resolved: true },
  { n: 2, conv: "90536e61-e5ba-4f03-9659-62f844e86b76", prefix: "Pour les cils et les sourcils" },
  { n: 3, conv: "473704c7-9407-4975-81fc-935dd2c3bcc4", prefix: "Bonjour ! Je suis l'assistante" },
  { n: 4, conv: "f870fd2e-8842-4d50-8d60-d48656ad71d8", prefix: "Souhaitez-vous vérifier un code" },
  { n: 5, conv: "cf8c036a-fac0-4215-8afa-01972cdc2109", prefix: "Talika a effectivement été récompensée" },
  { n: 6, conv: "4160bc00-c369-476d-a156-966d132cf364", prefix: "Le masque LED Therapy Mask de Talika utilise" },
]

const POINTS: { n: number; conv: string; text: string; resolved?: boolean }[] = [
  { n: 1, conv: "90536e61-e5ba-4f03-9659-62f844e86b76", text: "« Genius Light n'est pas mentionné dans nos informations » — l'appareil (indisponible) manquait à la base de connaissances.", resolved: true },
  { n: 2, conv: "90536e61-e5ba-4f03-9659-62f844e86b76", text: "La visiteuse demande si elle peut utiliser les deux appareils ensemble ; le bot répond sur Lipocils/Liposourcils (perte de contexte). Elle a dû reformuler." },
  { n: 3, conv: "473704c7-9407-4975-81fc-935dd2c3bcc4", text: "Prospection fournisseur B2B traitée comme une cliente. Faut-il un aiguillage « professionnel / partenariat » vers un email dédié ?" },
  { n: 4, conv: "f870fd2e-8842-4d50-8d60-d48656ad71d8", text: "« Comment bénéficier des 10 % première commande ? » — le bot propose de vérifier un code alors qu'elle demandait comment l'obtenir (newsletter ?). Vente potentiellement ratée." },
  { n: 5, conv: "cf8c036a-fac0-4215-8afa-01972cdc2109", text: "Le bot affirme que Talika a reçu le « Travel Retail Go for Gold Award » avec mentions de célébrités — à vérifier avec le marketing." },
  { n: 6, conv: "4160bc00-c369-476d-a156-966d132cf364", text: "Question santé (lumière bleue / yeux) : le bot affirme « sans risque ». Formulation à cadrer, et la cliente (2 commandes) attend la réponse SAV." },
]

// Markdown minimal, identique dans l'esprit au renderMarkdown du widget.
function renderMd(text: string): string {
  const html = text
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
  const lines = html.split("\n")
  const out: string[] = []
  let inList = false
  for (const line of lines) {
    if (/^\s*[-•]\s+/.test(line) || /^\s*\d+\.\s+/.test(line)) {
      if (!inList) { out.push("<ul>"); inList = true }
      out.push("<li>" + line.replace(/^\s*([-•]|\d+\.)\s+/, "") + "</li>")
    } else {
      if (inList) { out.push("</ul>"); inList = false }
      if (line.trim()) out.push("<p>" + line + "</p>")
    }
  }
  if (inList) out.push("</ul>")
  return out.join("")
}

function heure(iso: string): string {
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" })
}
function jourHeure(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" })
}
function prix(p?: string, cur?: string): string {
  if (!p) return ""
  return `${parseFloat(p).toFixed(2).replace(".", ",")} ${cur === "EUR" || !cur ? "€" : cur}`
}
function flagFor(convId: string, content: string): { n: number; resolved?: boolean } | null {
  const f = FLAGS.find((x) => x.conv === convId && content.startsWith(x.prefix))
  return f ? { n: f.n, resolved: f.resolved } : null
}

function NoteForm({ convId, onSaved }: { convId: string | null; onSaved: (notes: Note[]) => void }) {
  const [author, setAuthor] = useState("")
  const [text, setText] = useState("")
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    try { setAuthor(localStorage.getItem("revue_author") || "") } catch {}
  }, [])
  const submit = async () => {
    if (!author.trim() || !text.trim() || busy) return
    setBusy(true)
    try {
      localStorage.setItem("revue_author", author.trim())
      const res = await fetch("/api/revue-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ author: author.trim(), text: text.trim(), conv_id: convId }),
      })
      const data = await res.json()
      if (data.notes) { onSaved(data.notes); setText("") }
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="note-form">
      <input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Votre prénom" maxLength={60} />
      <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Votre note sur cette conversation…" maxLength={1000} rows={2} />
      <button onClick={submit} disabled={busy || !author.trim() || !text.trim()}>{busy ? "…" : "Ajouter la note"}</button>
    </div>
  )
}

export function RevueChatClient() {
  const [convs, setConvs] = useState<Conv[]>([])
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/revue-chat")
      const data = await res.json()
      setConvs(data.conversations || [])
      setNotes(data.notes || [])
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { load() }, [load])

  const notesFor = (convId: string | null) => notes.filter((n) => n.conv_id === convId)
  const totalMsgs = convs.reduce((s, c) => s + c.messages.length, 0)

  return (
    <div className="revue-root">
      <style>{CSS}</style>
      <div className="wrap">
        <header className="page">
          <h1>Talika — Revue des conversations</h1>
          <p className="sous">Chat IA talika.fr · 2–3 juillet 2026 · document temporaire de relecture — vos notes sont les bienvenues sous chaque conversation</p>
          {!loading && (
            <div className="stats">
              <div className="stat"><b>{convs.length}</b><span>conversations</span></div>
              <div className="stat"><b>{totalMsgs}</b><span>messages</span></div>
              <div className="stat"><b>{convs.filter((c) => c.status === "queued").length}</b><span>en attente SAV</span></div>
              <div className="stat"><b>{notes.length}</b><span>notes déposées</span></div>
            </div>
          )}
          <p className="note-haut">Les pastilles <span className="pf-inline">◆ n</span> marquent les moments listés en bas de page. Emails masqués. Les cartes produit reprennent l&apos;emplacement exact du widget (photos non incluses).</p>
        </header>

        {loading ? (
          <p className="chargement">Chargement des conversations…</p>
        ) : (
          <>
            {convs.map((c, ci) => (
              <section className="conv" key={c.id} id={`c${ci + 1}`}>
                <div className="conv-head">
                  <span className="av">T</span>
                  <div className="titres">
                    <strong>Talika</strong>
                    <span className="sub"><span className="dot" />Assistant beauté · en ligne</span>
                  </div>
                  {c.status === "queued" && <span className="chip queued">À TRAITER</span>}
                </div>
                <div className="conv-meta">
                  <span>Conversation <b>{ci + 1}/{convs.length}</b></span>
                  <span>Débutée le <b>{jourHeure(c.created_at)}</b></span>
                  <span>{c.email_masked ? <b>{c.email_masked}</b> : "Email non communiqué"}</span>
                  {c.orders_count > 0 && <span>Cliente · <b>{c.orders_count} commande{c.orders_count > 1 ? "s" : ""}</b></span>}
                </div>
                <div className="msgs">
                  {c.messages.map((m, mi) => {
                    if (m.role === "system") {
                      return <div className="m sys" key={mi}><div className="bubble">✓ {m.content} — {heure(m.created_at)}</div></div>
                    }
                    const isUser = m.role === "user"
                    const flag = !isUser ? flagFor(c.id, m.content) : null
                    return (
                      <div key={mi} style={{ display: "contents" }}>
                        <div className={`m ${isUser ? "user" : m.role === "agent" ? "agent" : "bot"}`}>
                          {!isUser && <span className="av">T</span>}
                          <div className="bubble">
                            {flag && <span className={`flag${flag.resolved ? " ok" : ""}`}>◆ {flag.n}</span>}
                            {m.role === "agent" && <div className="agent-label">ÉQUIPE TALIKA</div>}
                            <div dangerouslySetInnerHTML={{ __html: renderMd(m.content) }} />
                            <span className="heure">{heure(m.created_at)}</span>
                          </div>
                        </div>
                        {!isUser && m.product_refs && m.product_refs.length > 0 && (
                          <div className="cards">
                            {m.product_refs.map((p, pi) => (
                              <a className="card" key={pi} href={p.url || "#"} target="_blank" rel="noopener noreferrer">
                                <span className="img">{(p.title || "T").charAt(0)}</span>
                                <span className="nom">{p.title}</span>
                                <span className="prix">{prix(p.price, p.currency)}</span>
                                <span className="cta">Voir le produit →</span>
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
                <div className="conv-notes">
                  {notesFor(c.id).map((n, ni) => (
                    <div className="note" key={ni}>
                      <b>{n.author}</b>
                      <span className="note-date">{jourHeure(n.at)}</span>
                      <p>{n.text}</p>
                    </div>
                  ))}
                  <NoteForm convId={c.id} onSaved={setNotes} />
                </div>
              </section>
            ))}

            <section className="revue-pts">
              <h2>À examiner</h2>
              <p className="intro">Six moments relevés en préparant ce document — points de départ, pas conclusions : toute autre observation est bienvenue (ton, longueur des réponses, moments où proposer un humain ou un produit…).</p>
              <div className="points">
                {POINTS.map((p) => {
                  const idx = convs.findIndex((c) => c.id === p.conv)
                  return (
                    <div className="point" key={p.n}>
                      <span className="pf">◆ {p.n}</span>
                      <p>
                        {p.text}
                        {p.resolved && <span className="okb">corrigé le 30/06</span>}{" "}
                        {idx >= 0 && <a href={`#c${idx + 1}`}>Voir</a>}
                      </p>
                    </div>
                  )
                })}
              </div>
              <h2 style={{ marginTop: 36 }}>Notes générales</h2>
              <div className="conv-notes" style={{ borderTop: "none", padding: 0 }}>
                {notesFor(null).map((n, ni) => (
                  <div className="note" key={ni}>
                    <b>{n.author}</b>
                    <span className="note-date">{jourHeure(n.at)}</span>
                    <p>{n.text}</p>
                  </div>
                ))}
                <NoteForm convId={null} onSaved={setNotes} />
              </div>
            </section>
          </>
        )}
        <footer>Document interne Talika · page temporaire de relecture · merci de ne pas diffuser le lien</footer>
      </div>
    </div>
  )
}

const CSS = `
  .revue-root{--navy:#0A1638;--bleu:#1B30C7;--lait:#F7F4ED;--craie:#FFFFFF;--or:#D9B779;--vert:#3E9D6E;
    --encre:#22283B;--brume:#6B7080;--ligne:#E8E2D5;--ambre-bg:#FCF0DC;--ambre-tx:#8A5A12;
    background:var(--lait);min-height:100vh;color:var(--encre);
    font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
  .revue-root *{box-sizing:border-box}
  .revue-root a{color:var(--bleu)}
  .revue-root .wrap{max-width:760px;margin:0 auto;padding:36px 20px 80px}
  .revue-root header.page h1{font-family:Georgia,'Times New Roman',serif;font-style:italic;font-weight:500;
    font-size:32px;color:var(--navy);margin:0 0 4px}
  .revue-root .sous{color:var(--brume);font-size:14px;margin:0 0 22px;max-width:64ch}
  .revue-root .stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin:0 0 14px}
  .revue-root .stat{background:var(--craie);border:1px solid var(--ligne);border-radius:14px;padding:13px 15px}
  .revue-root .stat b{display:block;font-size:23px;color:var(--navy);font-variant-numeric:tabular-nums}
  .revue-root .stat span{font-size:11.5px;color:var(--brume);text-transform:uppercase;letter-spacing:.05em}
  .revue-root .note-haut{font-size:13px;color:var(--brume);margin:0 0 34px}
  .revue-root .pf-inline{background:var(--or);color:var(--navy);font-weight:700;border-radius:99px;padding:1px 7px;font-size:11px}
  .revue-root .chargement{color:var(--brume);text-align:center;padding:60px 0}
  .revue-root .chip{font-size:10px;font-weight:700;letter-spacing:.06em;padding:2px 8px;border-radius:99px}
  .revue-root .chip.queued{background:var(--ambre-bg);color:var(--ambre-tx)}
  .revue-root .conv{max-width:520px;margin:0 auto 40px;background:var(--craie);border-radius:18px;
    overflow:hidden;border:1px solid var(--ligne);box-shadow:0 10px 30px rgba(10,22,56,.08)}
  .revue-root .conv-head{background:var(--navy);color:#fff;display:flex;align-items:center;gap:11px;padding:13px 16px}
  .revue-root .av{flex:none;width:32px;height:32px;border-radius:50%;background:var(--navy);
    border:1.5px solid var(--or);display:flex;align-items:center;justify-content:center;
    font-family:Georgia,serif;font-style:italic;font-size:17px;color:var(--or)}
  .revue-root .conv-head .titres{flex:1;min-width:0}
  .revue-root .conv-head strong{font-family:Georgia,serif;font-style:italic;font-weight:500;font-size:16.5px;display:block;line-height:1.2}
  .revue-root .conv-head .sub{font-size:11px;opacity:.75;display:flex;align-items:center;gap:5px}
  .revue-root .dot{width:6px;height:6px;border-radius:50%;background:var(--vert);display:inline-block}
  .revue-root .conv-meta{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center;padding:9px 16px;
    background:#FBF9F3;border-bottom:1px solid var(--ligne);font-size:12px;color:var(--brume)}
  .revue-root .conv-meta b{color:var(--encre);font-weight:600}
  .revue-root .msgs{padding:16px 14px 20px;display:flex;flex-direction:column;gap:12px}
  .revue-root .m{display:flex;gap:8px;max-width:88%}
  .revue-root .m.bot,.revue-root .m.agent{align-self:flex-start}
  .revue-root .m.user{align-self:flex-end;flex-direction:row-reverse}
  .revue-root .m .av{width:26px;height:26px;font-size:14px;align-self:flex-end}
  .revue-root .bubble{position:relative;padding:10px 13px;font-size:13.5px;line-height:1.5;min-width:0}
  .revue-root .m.bot .bubble{background:var(--lait);border-radius:16px 16px 16px 4px}
  .revue-root .m.agent .bubble{background:#EAF0FF;border-radius:16px 16px 16px 4px}
  .revue-root .agent-label{font-size:9.5px;font-weight:700;letter-spacing:.08em;color:var(--bleu);margin-bottom:3px}
  .revue-root .m.user .bubble{background:var(--bleu);color:#fff;border-radius:16px 16px 4px 16px}
  .revue-root .m.user .bubble a{color:#D7DEFF}
  .revue-root .m.sys{align-self:center;max-width:100%}
  .revue-root .m.sys .bubble{background:none;color:var(--brume);font-size:12px;font-style:italic;padding:2px 6px}
  .revue-root .bubble p{margin:0 0 8px}
  .revue-root .bubble p:last-of-type{margin-bottom:0}
  .revue-root .bubble ul{margin:6px 0;padding-left:19px}
  .revue-root .bubble li{margin:3px 0}
  .revue-root .heure{display:block;font-size:10px;color:var(--brume);margin-top:4px;font-variant-numeric:tabular-nums}
  .revue-root .m.user .heure{color:rgba(255,255,255,.65);text-align:right}
  .revue-root .flag{position:absolute;top:-9px;right:-9px;background:var(--or);color:var(--navy);
    font-size:10.5px;font-weight:700;border-radius:99px;padding:2px 7px;box-shadow:0 1px 4px rgba(10,22,56,.25)}
  .revue-root .flag.ok{background:#CBE7D6;color:#1F6B45}
  .revue-root .cards{display:flex;gap:10px;overflow-x:auto;padding:2px 2px 6px 34px;scrollbar-width:thin;max-width:100%}
  .revue-root .card{flex:none;width:168px;background:var(--craie);border:1px solid var(--ligne);
    border-radius:12px;padding:10px;text-decoration:none;display:block}
  .revue-root .card .img{width:52px;height:52px;border-radius:9px;background:var(--navy);
    display:flex;align-items:center;justify-content:center;margin-bottom:8px;
    font-family:Georgia,serif;font-style:italic;font-size:24px;color:var(--or)}
  .revue-root .card .nom{display:block;font-size:12px;font-weight:600;color:var(--navy);line-height:1.3;margin-bottom:3px}
  .revue-root .card .prix{display:block;font-size:12.5px;color:var(--encre);font-variant-numeric:tabular-nums;margin-bottom:5px}
  .revue-root .card .cta{display:block;font-size:11.5px;color:var(--bleu);font-weight:600}
  .revue-root .conv-notes{border-top:1px solid var(--ligne);background:#FBF9F3;padding:12px 16px 14px;display:flex;flex-direction:column;gap:10px}
  .revue-root .note{background:var(--craie);border:1px solid var(--ligne);border-radius:10px;padding:9px 12px;font-size:13px}
  .revue-root .note b{color:var(--navy)}
  .revue-root .note-date{color:var(--brume);font-size:11px;margin-left:8px}
  .revue-root .note p{margin:4px 0 0;white-space:pre-wrap}
  .revue-root .note-form{display:flex;flex-direction:column;gap:6px}
  .revue-root .note-form input,.revue-root .note-form textarea{border:1px solid var(--ligne);border-radius:9px;
    padding:8px 11px;font:inherit;font-size:13px;background:var(--craie);color:var(--encre)}
  .revue-root .note-form input:focus,.revue-root .note-form textarea:focus{outline:2px solid var(--bleu);outline-offset:-1px}
  .revue-root .note-form button{align-self:flex-end;background:var(--navy);color:#fff;border:none;border-radius:99px;
    padding:7px 16px;font-size:12.5px;font-weight:600;cursor:pointer}
  .revue-root .note-form button:disabled{opacity:.45;cursor:default}
  .revue-root .revue-pts{max-width:760px;margin:56px auto 0}
  .revue-root .revue-pts h2{font-family:Georgia,serif;font-style:italic;font-weight:500;font-size:23px;color:var(--navy);margin:0 0 6px}
  .revue-root .intro{color:var(--brume);font-size:14px;margin:0 0 18px;max-width:62ch}
  .revue-root .points{display:flex;flex-direction:column;gap:10px}
  .revue-root .point{background:var(--craie);border:1px solid var(--ligne);border-radius:14px;
    padding:13px 16px;display:flex;gap:12px;align-items:flex-start}
  .revue-root .point .pf{flex:none;background:var(--or);color:var(--navy);font-size:11px;font-weight:700;
    border-radius:99px;padding:2px 8px;margin-top:2px}
  .revue-root .point p{margin:0;font-size:14px}
  .revue-root .okb{display:inline-block;font-size:11px;font-weight:700;color:#1F6B45;background:#E7F3EC;
    border-radius:99px;padding:1px 8px;margin-left:6px}
  .revue-root footer{margin-top:48px;text-align:center;color:var(--brume);font-size:12px}
  @media (prefers-reduced-motion:no-preference){.revue-root{scroll-behavior:smooth}}
`
