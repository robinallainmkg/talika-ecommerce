"use client"

import { useState } from "react"

// ── Modèle de données (stocké dans influencers.metadata.audience) ──
// Alimenté par la routine outreach : quand un lead renvoie un média-kit
// (captures analytics IG/TikTok ou lien type Blackwell/Kolsquare), Claude Code
// en extrait ces chiffres et fait un UPSERT dans metadata.audience.
// Le drawer est en LECTURE SEULE — il ne fait que rendre ce bloc.
export type NamePct = { name: string; pct: number }
export type AgeRow = { bracket: string; total?: number; female?: number; male?: number }
export type GenderSplit = { female?: number; male?: number }
export type PlatformAudience = {
  source?: string
  gender?: GenderSplit
  age?: AgeRow[]
  countries?: NamePct[]
  cities?: NamePct[]
  languages?: NamePct[]
}
export type AudienceData = {
  updated_at?: string
  platforms?: Record<string, PlatformAudience>
}

const PLATFORM_LABEL: Record<string, string> = { instagram: "Instagram", tiktok: "TikTok", youtube: "YouTube" }

// Affichage FR des pays / langues (la base stocke le libellé canonique anglais).
const COUNTRY_FR: Record<string, string> = {
  "United States": "États-Unis", "United Kingdom": "Royaume-Uni", Canada: "Canada",
  Australia: "Australie", Germany: "Allemagne", France: "France", Brazil: "Brésil",
  Mexico: "Mexique", India: "Inde", Algeria: "Algérie", Philippines: "Philippines",
  Spain: "Espagne", Italy: "Italie", Netherlands: "Pays-Bas", Ireland: "Irlande",
}
const LANG_FR: Record<string, string> = {
  English: "Anglais", Spanish: "Espagnol", Portuguese: "Portugais", French: "Français",
  Arabic: "Arabe", German: "Allemand", Italian: "Italien", Dutch: "Néerlandais",
}
const frCountry = (n: string) => COUNTRY_FR[n] ?? n
const frLang = (n: string) => LANG_FR[n] ?? n
const pctLabel = (v: number) => `${v.toFixed(v < 10 ? 1 : 0).replace(".", ",")} %`

// Petite carte façon média-kit (fond clair, titre, source).
function Card({ title, source, right, children }: { title: string; source?: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-zinc-100 bg-zinc-50/60 p-3">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <div className="text-[13px] font-semibold text-zinc-800">{title}</div>
          {source && <div className="text-[10px] text-zinc-400">{"Source : "}{source}</div>}
        </div>
        {right}
      </div>
      {children}
    </div>
  )
}

// Liste « libellé … valeur » (Localisations, Langues) — pas de barres, comme la maquette.
function RankRows({ rows, tr }: { rows: NamePct[]; tr: (n: string) => string }) {
  if (!rows.length) return <p className="text-xs text-zinc-400">Aucune donnée.</p>
  return (
    <div className="divide-y divide-zinc-100">
      {rows.map((r) => (
        <div key={r.name} className="flex items-center justify-between py-1.5 text-sm">
          <span className="text-zinc-600">{tr(r.name)}</span>
          <span className="font-semibold text-zinc-900">{pctLabel(r.pct)}</span>
        </div>
      ))}
    </div>
  )
}

// Histogramme âge (barres verticales). Si female/male fournis → deux barres par
// tranche (violet/bleu, façon Kolsquare) ; sinon une seule barre par tranche.
function AgeChart({ age }: { age: AgeRow[] }) {
  const val = (r: AgeRow) => (r.total ?? (r.female ?? 0) + (r.male ?? 0))
  const max = Math.max(1, ...age.map((r) => Math.max(val(r), r.female ?? 0, r.male ?? 0)))
  const split = age.some((r) => r.female != null || r.male != null)
  // Hauteurs en PIXELS (pas en %) : un % de hauteur exige un parent à hauteur
  // définie — dans ce flex imbriqué il se résolvait à 0 → barres invisibles.
  const AREA = 76
  const h = (v: number) => Math.max(2, Math.round((v / max) * AREA))
  return (
    <div className="flex gap-1.5">
      {age.map((r) => (
        <div key={r.bracket} className="flex flex-1 flex-col items-center gap-1">
          <div className="flex w-full items-end justify-center gap-0.5" style={{ height: AREA }}>
            {split ? (
              <>
                <div className="w-2 rounded-t bg-violet-500" style={{ height: h(r.female ?? 0) }} title={`Femme ${pctLabel(r.female ?? 0)}`} />
                <div className="w-2 rounded-t bg-sky-400" style={{ height: h(r.male ?? 0) }} title={`Homme ${pctLabel(r.male ?? 0)}`} />
              </>
            ) : (
              <div className="w-3.5 rounded-t bg-sky-400" style={{ height: h(val(r)) }} title={pctLabel(val(r))} />
            )}
          </div>
          <span className="text-[9px] text-zinc-400">{r.bracket}</span>
          <span className="text-[9px] font-medium text-zinc-500">{pctLabel(val(r))}</span>
        </div>
      ))}
    </div>
  )
}

export function AudienceSection({ audience }: { audience: AudienceData | undefined }) {
  const platforms = audience?.platforms || {}
  const keys = Object.keys(platforms).filter((k) => {
    const p = platforms[k]
    return p && (p.age?.length || p.countries?.length || p.languages?.length || p.gender)
  })
  const [active, setActive] = useState(keys[0] || "")

  const border = "border-t border-zinc-100 px-5 py-4"
  if (keys.length === 0) {
    return (
      <div className={border}>
        <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">Audience</h3>
        <p className="text-sm text-zinc-400">Pas encore de données d&apos;audience. La routine les ajoute quand un média-kit arrive.</p>
      </div>
    )
  }

  const cur = platforms[keys.includes(active) ? active : keys[0]]
  const g = cur.gender

  return (
    <div className={border}>
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Audience
          {audience?.updated_at && <span className="text-[10px] normal-case text-zinc-300">maj {audience.updated_at}</span>}
        </h3>
        {keys.length > 1 && (
          <div className="flex rounded-lg bg-zinc-100 p-0.5">
            {keys.map((k) => (
              <button
                key={k}
                onClick={() => setActive(k)}
                className={`rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors ${
                  (keys.includes(active) ? active : keys[0]) === k ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-800"
                }`}>
                {PLATFORM_LABEL[k] ?? k}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2.5">
        {/* Âge & genre */}
        {(cur.age?.length || g) && (
          <Card title="Âge et genre" source={cur.source}>
            {g && (
              <div className="mb-2 flex items-center gap-4 text-xs">
                {g.female != null && (
                  <span className="inline-flex items-center gap-1.5 text-zinc-600">
                    <span className="h-2 w-2 rounded-full bg-violet-500" />Femme <b className="font-semibold text-zinc-800">{pctLabel(g.female)}</b>
                  </span>
                )}
                {g.male != null && (
                  <span className="inline-flex items-center gap-1.5 text-zinc-600">
                    <span className="h-2 w-2 rounded-full bg-sky-400" />Homme <b className="font-semibold text-zinc-800">{pctLabel(g.male)}</b>
                  </span>
                )}
              </div>
            )}
            {cur.age?.length ? <AgeChart age={cur.age} /> : null}
          </Card>
        )}

        {/* Localisations (toggle Pays / Ville si villes dispo) */}
        {(cur.countries?.length || cur.cities?.length) && (
          <LocationsCard source={cur.source} countries={cur.countries || []} cities={cur.cities || []} />
        )}

        {/* Langues */}
        {cur.languages?.length ? (
          <Card title="Langues" source={cur.source}>
            <RankRows rows={cur.languages} tr={frLang} />
          </Card>
        ) : null}
      </div>
    </div>
  )
}

function LocationsCard({ source, countries, cities }: { source?: string; countries: NamePct[]; cities: NamePct[] }) {
  const [tab, setTab] = useState<"pays" | "ville">("pays")
  const hasCities = cities.length > 0
  const showVille = tab === "ville" && hasCities
  const toggle = (
    <div className="flex rounded-lg bg-zinc-100 p-0.5">
      {(["pays", "ville"] as const).map((t) => (
        <button
          key={t}
          disabled={t === "ville" && !hasCities}
          onClick={() => setTab(t)}
          className={`rounded-md px-2 py-0.5 text-[11px] font-medium capitalize transition-colors ${
            tab === t ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-800"
          } ${t === "ville" && !hasCities ? "cursor-not-allowed opacity-40 hover:text-zinc-500" : ""}`}>
          {t}
        </button>
      ))}
    </div>
  )
  return (
    <Card title="Localisations" source={source} right={toggle}>
      <RankRows rows={showVille ? cities : countries} tr={frCountry} />
    </Card>
  )
}
