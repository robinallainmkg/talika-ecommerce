# API outreach HTTPS — boîte créatrices `talika@companion-ecommerce.com`

Deux routes pour qu'un agent cloud (Pilotage, HTTPS seulement) **envoie** et **lise** le fil
de la boîte créatrices sans SMTP ni IMAP de son côté. Elles réutilisent le chemin d'envoi du
drip et de la réponse in-app (`src/lib/mailer.ts` → `sendMail`) et le journal
`influence_messages`. Elles ne touchent **ni** à la logique du drip **ni** à `outreach_log`.

Auth (identique au cron) : `Authorization: Bearer $CRON_SECRET`. Sans secret posé côté
serveur ou avec un mauvais bearer → `401`.
Le préfixe `/api/outreach/` est dans `PUBLIC_PREFIXES` de `src/middleware.ts` (sinon le
middleware répond `401 {"error":"non authentifié"}` avant la route — c'est le signe d'un
oubli de liste blanche, pas d'un mauvais secret).

## 1. `POST /api/outreach/send`

Fichier : `src/app/api/outreach/send/route.ts` · `maxDuration = 60`.

Corps JSON :

| Champ | Type | Règle |
|---|---|---|
| `to` | `string \| string[]` | requis, **≤ 3** adresses valides (sinon `400`) |
| `subject` | `string` | requis, ≤ 500 caractères |
| `text` | `string` | requis (corps texte brut — c'est ce qui est journalisé) |
| `html` | `string` | optionnel |
| `in_reply_to` | `string` | optionnel, Message-ID du message auquel on répond (chevrons ajoutés si absents) |
| `references` | `string \| string[]` | optionnel ; `in_reply_to` y est ajouté automatiquement |
| `market` | `'UK' \| 'US' \| 'FR'` | requis (colonne `market` du journal) |
| `influencer_id` | `uuid` | optionnel — force la fiche journalisée pour le 1er destinataire |
| `attachments` | `[{ filename, content_base64, content_type? }]` | optionnel, ≤ 10 |
| `dry_run` | `boolean` | `true` = rien n'est envoyé ni journalisé |

Limites : corps HTTP brut **> 4 Mo → `413`** (Vercel coupe de toute façon vers 4,5 Mo) ;
`to` invalide / > 3 / champs manquants → `400` ; canal mail absent ou envoi refusé par le
fournisseur → `500`.

Ce que fait la route :
1. valide, génère un `Message-ID` `<uuid@companion-ecommerce.com>` (domaine de `OUTREACH_FROM`),
   pose `In-Reply-To` / `References` ;
2. envoie via `sendMail` — **même arbitrage que le drip** : Resend HTTP si `RESEND_API_KEY`
   existe, sinon SMTP (`SMTP_HOST/USER/PASS`, Hostinger) ; expéditeur `OUTREACH_FROM`
   (défaut `Talika <talika@companion-ecommerce.com>`), Reply-To `OUTREACH_REPLY_TO`
   (défaut `talika@companion-ecommerce.com`) — identiques à `/api/influencers/conversations/reply` ;
3. journalise dans `influence_messages` (`direction='out'`, `source='compose'`, `market`,
   `mailbox`, `from_email`, `to_email`, `subject`, `body_text`, `message_id`, `in_reply_to`,
   `references_ids`, `provider_id`, `sent_at`). Best-effort : l'email est parti, un échec de
   journal renvoie `ok:true` + `warning`.

Pourquoi `source='compose'` et pas `'api'` : la table porte une contrainte
`CHECK (source IN ('drip','compose','reply_ui','imap','graph','manual','backfill'))` ; ajouter
`'api'` demanderait une migration (hors périmètre, à montrer à Robin avant). `influencer_id`
est `NOT NULL` : la fiche est résolue par `influencer_id` fourni, sinon par l'email du
destinataire (même marché en priorité). Pas de fiche → envoyé mais non journalisé (`journaled[].ok=false`).

Pas d'append dans le dossier « Sent » IMAP : `src/lib/influence/imap.ts` est en lecture seule
(aucune fonction d'append n'existe, on n'en a pas écrit).

### Exemples

Dry run (rien ne part) :

```bash
curl -sS -X POST "https://talika-ecommerce.vercel.app/api/outreach/send" \
  -H "Authorization: Bearer $CRON_SECRET" -H "Content-Type: application/json" \
  -d '{"to":"creatrice@example.com","subject":"Re: Talika x You","text":"Hi Jane,\n\n…","market":"UK","dry_run":true}'
```

Réponse :

```json
{ "ok": true, "dry_run": true,
  "rendered": { "from": "Talika <talika@companion-ecommerce.com>", "reply_to": "talika@companion-ecommerce.com",
    "to": ["creatrice@example.com"], "subject": "Re: Talika x You", "market": "UK",
    "headers": { "Message-ID": "<…@companion-ecommerce.com>" }, "size_bytes": 123, "has_html": false,
    "attachments": [], "channel": "resend" } }
```

Envoi réel, en réponse à un message du fil, avec un PDF :

```bash
curl -sS -X POST "https://talika-ecommerce.vercel.app/api/outreach/send" \
  -H "Authorization: Bearer $CRON_SECRET" -H "Content-Type: application/json" \
  -d @- <<JSON
{ "to": "creatrice@example.com", "market": "UK", "subject": "Re: Talika x You",
  "text": "Hi Jane, …", "in_reply_to": "<abc123@mail.gmail.com>",
  "attachments": [{ "filename": "brief.pdf", "content_base64": "$(base64 -w0 brief.pdf)", "content_type": "application/pdf" }] }
JSON
```

Réponse : `{ ok, message_id, provider_id, channel, to, subject, market, sent_at, journaled:[{ to_email, influencer_id, ok }] }`.

## 2. `GET /api/outreach/messages`

Fichier : `src/app/api/outreach/messages/route.ts`. Lecture seule de `influence_messages`,
tri `sent_at desc`.

Paramètres : `market=UK|US|FR` · `since=<ISO>` · `limit` (défaut 50, **max 200**) ·
`email=` (expéditeur OU destinataire) · `influencer_id=<uuid>` · `direction=in|out`.

```bash
curl -sS "https://talika-ecommerce.vercel.app/api/outreach/messages?market=UK&since=2026-10-01T00:00:00Z&limit=50" \
  -H "Authorization: Bearer $CRON_SECRET"
curl -sS "https://talika-ecommerce.vercel.app/api/outreach/messages?email=creatrice@example.com&limit=20" \
  -H "Authorization: Bearer $CRON_SECRET"
```

Réponse : `{ ok, count, limit, filters, messages:[{ id, influencer_id, market, mailbox, direction, source, message_id, in_reply_to, references_ids, provider_id, from_email, to_email, subject, body_text, sent_at, created_at }] }`.

⚠️ Cette route **ne lit pas l'IMAP** : elle renvoie ce que le cron a déjà archivé. Pour
rafraîchir les entrants avant de lire : `GET /api/cron/outreach?scan=1&limit=100` (ci-dessous).

## 3. Ce que fait `GET /api/cron/outreach?scan=1`

Section IMAP **seule** : lit les `limit` derniers messages de l'INBOX (défaut 60, max 500),
archive dans `influence_messages` tous les entrants dont l'expéditrice est une fiche
`influencers` du marché UK (upsert idempotent sur `(mailbox, message_id)`), classe la
**première** réponse de chaque contact (statut Intéressée / Pas intéressée / Désinscrit /
Répondu → `influencers.metadata.outreach`, ligne `outreach_log` channel `reply`, carte kanban),
marque les bounces (statut terminal `Bounce`), puis **s'arrête** : ni batch, ni digest.
Donc `?scan=1` seul n'envoie jamais rien ; ses seuls effets de bord sont l'archivage et la
classification/pipeline (pas « sans effet » strictement : une première réponse non encore
vue change le statut du contact — ce qui stoppe son drip). Les expéditrices inconnues
(hors fiches UK) ne sont **pas** archivées.

## 4. Audit du cron `GET /api/cron/outreach` (10 lignes)

1. Auth : `Authorization: Bearer CRON_SECRET` (comparaison stricte, 401 sinon).
2. Paramètres : `ping=1` (santé + sonde du compteur), `send=1` (envoi réel pour CE run),
   `only=<influencer_id>` (run ciblé), `scan=1` (IMAP seul), `limit=` (fenêtre IMAP, max 500).
3. Envoi réel **uniquement** si `OUTREACH_ENABLED=1` (env) **ou** `?send=1` ; sinon DRY
   (tout est calculé et journalisé en `status='dry'`, rien ne part).
4. Marché **en dur** `MARKET = "UK"` (le drip US tourne en scripts locaux sur le Mac).
5. Plafond/jour = `OUTREACH_DAILY_CAP` sinon rampe warm-up (8 → 15 → 25 → 40 → 60 selon les
   jours depuis le 1er envoi réel), décompté de ce qui est déjà parti aujourd'hui (UTC)
   dans `outreach_log` ; jours ouvrés seulement.
6. **Fail-closed** : compteur journalier illisible → 503 et aucun envoi ; anti-doublon illisible
   → batch annulé ; écriture d'état échouée après un envoi → batch stoppé.
7. Dédup : `outreach_log` (`channel='email'`, `status='sent'`, 30 derniers jours, clé
   `influencer_id:step`) = source de vérité, indépendante du `metadata`.
8. Journal d'affichage `influence_messages` = best-effort, jamais bloquant.
9. Envoi via `sendOutreach` → `sendMail` (Resend HTTP si `RESEND_API_KEY`, sinon SMTP), texte
   brut, `from` `OUTREACH_FROM`, Reply-To `OUTREACH_REPLY_TO` (défauts talika@companion-ecommerce.com).
10. Digest HTML à `OUTREACH_DIGEST_TO` seulement s'il s'est passé quelque chose.

`POST /api/influencers/conversations/reply` (clic UI) : même `sendMail`, threading depuis le
dernier entrant non-synthétique du fil, journal `source='reply_ui'`, **n'écrit pas** dans
`outreach_log`. Les nouvelles routes suivent exactement ce modèle.
