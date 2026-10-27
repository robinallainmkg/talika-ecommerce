"use client"

import { useCallback, useEffect, useState } from "react"

// Robin, 27/10 : « ce qui est validé, tu le caches par défaut, faut pouvoir cliquer pour afficher ».
// Les lignes portent data-validated="1|0" (posé par le serveur puis par <Feedback> après un clic).
// Ce bouton montre ou cache ces lignes avec l'attribut hidden, et cache un groupe (semaine) vide.
export const VALIDATED_EVENT = "eq-validated-change"

function apply(show: boolean): number {
  const root = document.querySelector<HTMLElement>(".eq")
  if (root) root.dataset.show = show ? "1" : "0"
  const rows = Array.from(document.querySelectorAll<HTMLElement>("li[data-validated]"))
  let n = 0
  for (const li of rows) {
    const v = li.dataset.validated === "1"
    if (v) n++
    li.hidden = v && !show
  }
  document.querySelectorAll<HTMLElement>("[data-group]").forEach((g) => {
    const items = Array.from(g.querySelectorAll<HTMLElement>("li[data-validated]"))
    g.hidden = items.length > 0 && items.every((li) => li.hidden)
  })
  return n
}

export function ValidatedToggle({ initialCount }: { initialCount: number }) {
  const [show, setShow] = useState(false)
  const [count, setCount] = useState(initialCount)
  const sync = useCallback(() => setCount(apply(show)), [show])

  useEffect(() => {
    sync()
    window.addEventListener(VALIDATED_EVENT, sync)
    return () => window.removeEventListener(VALIDATED_EVENT, sync)
  }, [sync])

  if (count === 0 && !show) return null
  return (
    <button
      type="button"
      onClick={() => setShow((s) => !s)}
      aria-pressed={show}
      className="min-h-10 rounded-lg border border-[var(--ok-ink)] bg-[var(--ok-bg)] px-3 text-sm font-semibold text-[var(--ok-ink)]"
    >
      {show ? "Masquer les lignes validées" : `Afficher ${count === 1 ? "la ligne validée" : `les ${count} lignes validées`}`}
    </button>
  )
}
