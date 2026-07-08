// One-shot (8 juil. 2026) : purge des chunks KB pollués par le bloc Genius Light
// copié sur les fiches Hair Force (métafield accentuate.results erroné côté Shopify,
// non affiché par le thème mais indexé par le RAG), + correction des métadonnées
// fausses héritées de Shopify (casquette typée « Soin du visage », tag
// « électrostimulation » sur Genius Eyes). Les documents gardent leur content_hash :
// le sync produits ne recrée pas ces chunks tant que la fiche Shopify ne change pas ;
// le jour où les métafields sont corrigés à la source, la ré-indexation reprend la main.
// Usage : NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… MISTRAL_API_KEY=… \
//         npx tsx scripts/fix-kb-chunks-hairforce.ts
import fs from "node:fs"
import { createClient } from "@supabase/supabase-js"
import { embedTexts } from "../src/lib/chat/mistral"

const DELETE_IDS = [
  "ed9eb57f-6bde-4fa4-b255-49081b321cfa", // Booster Hair Force + 1 Serum — chunk « Conseils d'utilisation » (bloc Genius Light)
  "0527d043-2802-40c1-878a-d2d5dabe6aa5", // Hair Force Caps — idem
  "75ef1486-3e91-4f68-833c-03c1e94c6dc4", // Hair Force Sérum — idem
]

async function main() {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )

  // 1. Chunks à corriger (contenu récupéré au moment de l'exécution)
  const { data: geniusDoc } = await db
    .from("kb_documents").select("id").eq("title", "Genius Eyes").single()
  const { data: capDoc } = await db
    .from("kb_documents").select("id").eq("title", "Hair Force LED Cap").single()
  if (!geniusDoc || !capDoc) throw new Error("documents Genius Eyes / Hair Force LED Cap introuvables")

  const { data: toFix } = await db
    .from("kb_chunks")
    .select("id, document_id, chunk_index, section_heading, content")
    .in("document_id", [geniusDoc.id, capDoc.id])
    .eq("chunk_index", 0)

  const { data: toDelete } = await db
    .from("kb_chunks")
    .select("id, document_id, chunk_index, section_heading, content")
    .in("id", DELETE_IDS)

  // 2. Sauvegarde avant toute écriture
  const backupPath = `scripts/backup-kb-chunks-${new Date().toISOString().slice(0, 10)}.json`
  fs.writeFileSync(backupPath, JSON.stringify({ deleted: toDelete, edited: toFix }, null, 2))
  console.log(`sauvegarde -> ${backupPath}`)

  // 3. Suppression des 3 chunks « bloc Genius Light »
  const { error: delError, count } = await db
    .from("kb_chunks").delete({ count: "exact" }).in("id", DELETE_IDS)
  if (delError) throw new Error(delError.message)
  console.log(`chunks supprimés : ${count}`)

  // 4. Corrections de contenu + ré-embedding
  for (const chunk of toFix || []) {
    let content = chunk.content as string
    if (chunk.document_id === geniusDoc.id) {
      // Genius Eyes n'a pas d'électrostimulation (LED rouge + infrarouge uniquement,
      // cf. doc SAV « Genius Light vs Genius Eyes ») — tag Shopify erroné.
      content = content.replace(/,?\s*électrostimulation/gi, "")
    } else {
      // Casquette LED : type/format Shopify erronés (copiés d'un masque tissu).
      content = content
        .replace(/Type : Soin du visage/i, "Type : Cosmétique instrumentale (appareil LED anti-chute pour les cheveux)")
        .replace(/\nFormat : 1 masque - 12g/i, "")
        .replace(/Tags : [^\n]*\n/i, "")
    }
    if (content === chunk.content) {
      console.log(`aucun changement pour chunk ${chunk.id} — ignoré`)
      continue
    }
    // Ré-embedding si la clé est dispo ; sinon on garde l'ancien vecteur (dérive
    // négligeable pour quelques mots — le contenu servi au LLM, lui, est corrigé).
    const patch: Record<string, unknown> = { content }
    if (process.env.MISTRAL_API_KEY) {
      const [embedding] = await embedTexts([`${chunk.section_heading}\n\n${content}`])
      patch.embedding = embedding
    }
    const { error } = await db.from("kb_chunks").update(patch).eq("id", chunk.id)
    if (error) throw new Error(error.message)
    console.log(`chunk corrigé : ${chunk.id} (${chunk.section_heading}) ${patch.embedding ? "avec" : "sans"} ré-embedding`)
  }

  console.log("terminé")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
