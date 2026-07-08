// Exécute la synchro fiches produits Shopify -> base de connaissance du chat,
// hors back-office (même code que POST /api/chat/admin/kb/sync-products).
// Usage : npx tsx scripts/run-kb-sync.ts  (charge .env.local comme Next)
import { loadEnvConfig } from "@next/env"
loadEnvConfig(process.cwd())

import { createClient } from "@supabase/supabase-js"
import { syncProducts } from "../src/lib/chat/shopify-products"

async function main() {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
  const result = await syncProducts(db)
  console.log(JSON.stringify(result, null, 2))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
