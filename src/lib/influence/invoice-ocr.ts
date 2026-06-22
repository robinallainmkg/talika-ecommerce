import { extractText } from "@/lib/chat/extract"

// Extraction des champs d'une facture influenceuse via Mistral (déjà branché pour
// le chat). PDF → texte (unpdf) puis Mistral ; image → Mistral vision (pixtral).
// On ne fait JAMAIS confiance aveuglément : le montant détecté est PRÉ-REMPLI et
// l'humain valide (cf. règle "valeur théorique écrasable par l'humain").

const MISTRAL_URL = "https://api.mistral.ai/v1/chat/completions"

const PROMPT = `Tu extrais les informations d'une facture (prestataire / influenceuse).
Réponds UNIQUEMENT en JSON valide, sans texte autour :
{"amount": number|null, "amount_ttc": number|null, "date": "YYYY-MM-DD"|null, "supplier": string|null}
- amount = montant HT à régler si présent, sinon le total net. Nombre brut, sans symbole ni espace.
- amount_ttc = total TTC si présent.
- date = date d'émission de la facture (format YYYY-MM-DD).
- supplier = nom de l'émetteur.
Mets null si une info est absente.`

export interface InvoiceFields {
  amount: number | null
  amount_ttc: number | null
  date: string | null
  supplier: string | null
}

export async function extractInvoiceFields(buffer: ArrayBuffer, mime: string): Promise<InvoiceFields> {
  let model = "mistral-small-latest"
  let userContent: unknown

  if (mime === "application/pdf") {
    const text = await extractText(buffer, mime)
    userContent = `Facture (texte extrait) :\n\n${text.slice(0, 8000)}`
  } else if (mime.startsWith("image/")) {
    model = "pixtral-12b-latest"
    const b64 = Buffer.from(buffer).toString("base64")
    userContent = [
      { type: "text", text: "Voici une facture, extrais les champs demandés." },
      { type: "image_url", image_url: `data:${mime};base64,${b64}` },
    ]
  } else {
    throw new Error("Type de fichier non supporté pour l'OCR")
  }

  const res = await fetch(MISTRAL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.MISTRAL_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: PROMPT },
        { role: "user", content: userContent },
      ],
      temperature: 0,
      max_tokens: 300,
      response_format: { type: "json_object" },
    }),
  })
  if (!res.ok) {
    throw new Error(`Mistral OCR error ${res.status}: ${(await res.text()).slice(0, 200)}`)
  }
  const json = await res.json()
  const content = json.choices?.[0]?.message?.content || "{}"
  let parsed: Record<string, unknown> = {}
  try {
    parsed = JSON.parse(content)
  } catch {
    parsed = {}
  }
  const num = (v: unknown) => (v == null || isNaN(Number(v)) ? null : Number(v))
  return {
    amount: num(parsed.amount),
    amount_ttc: num(parsed.amount_ttc),
    date: typeof parsed.date === "string" ? parsed.date : null,
    supplier: typeof parsed.supplier === "string" ? parsed.supplier : null,
  }
}
