import type { Metadata } from "next"
import { RevueChatClient } from "./revue-client"

// Page TEMPORAIRE de revue des conversations du chat (2-3 juillet 2026),
// publique pour permettre à une collaboratrice externe de laisser ses notes.
// Non indexée. À retirer après la revue (avec /api/revue-chat + middleware).
export const metadata: Metadata = {
  title: "Talika — Revue chat 48 h",
  robots: { index: false, follow: false },
}

export default function RevueChatPage() {
  return <RevueChatClient />
}
