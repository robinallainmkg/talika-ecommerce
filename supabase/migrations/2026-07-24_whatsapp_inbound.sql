-- WhatsApp entrant -> Companion / Chat
-- À RELIRE ET VALIDER AVANT APPLICATION (règle CLAUDE.md : montrer le SQL avant toute migration).
-- Rien n'a été appliqué sur uvohlnmwiucedehemxrt.
--
-- Principe : on NE crée PAS un nouveau module. Le back-office chat existant
-- (chat_conversations / chat_messages, drawer, takeover, reply) devient multi-canal.
-- La colonne `channel` existe déjà (défaut 'shopify') -> les fils WhatsApp valent 'whatsapp'.
--
-- CNIL / minimisation (compte déjà sous chantier, cf CDC-consentement-ouvertures-email-CNIL.md) :
--   Finalité : traitement d'une demande SAV initiée par la cliente (exécution du contrat de vente).
--   Données : numéro E.164, prénom, id de profil Klaviyo, corps des messages échangés.
--   NON stocké : contenu de commande (relu en direct chez Shopify à chaque ouverture du fil).
--   Conservation : 90 jours après le dernier message, puis purge (fonction purge_whatsapp_expired).
--   Base légale : art. 6.1.b RGPD (mesures précontractuelles / exécution du contrat).

begin;

-- 1. Le fil de conversation porte désormais un téléphone et l'ancrage Klaviyo.
alter table public.chat_conversations
  add column if not exists visitor_phone            text,
  add column if not exists klaviyo_profile_id       text,
  add column if not exists klaviyo_conversation_id  text,
  -- Fin de la fenêtre de service Meta de 24 h : au-delà, plus de réponse libre possible.
  add column if not exists service_window_expires_at timestamptz;

comment on column public.chat_conversations.visitor_phone is
  'E.164. Donnée SAV, purgée 90 j après le dernier message (purge_whatsapp_expired).';
comment on column public.chat_conversations.service_window_expires_at is
  'Fenêtre de service WhatsApp 24 h ouverte par le dernier message entrant. Passé ce délai, Meta exige un template approuvé.';

create unique index if not exists chat_conversations_klaviyo_conv_uidx
  on public.chat_conversations (klaviyo_conversation_id)
  where klaviyo_conversation_id is not null;

create index if not exists chat_conversations_channel_idx
  on public.chat_conversations (channel, last_message_at desc);

-- 2. Dédup des messages repêchés par polling (le même message est relu à chaque tour).
alter table public.chat_messages
  add column if not exists external_id text;

create unique index if not exists chat_messages_external_uidx
  on public.chat_messages (external_id)
  where external_id is not null;

-- 3. Watchlist : qui faut-il interroger, et jusqu'à quand.
--    Alimentée par le webhook Klaviyo `received_whatsapp` (= message délivré à la cliente),
--    car il n'existe aucun webhook pour un message ENTRANT (topics du compte, 24/07/2026).
create table if not exists public.whatsapp_watchlist (
  klaviyo_profile_id text primary key,
  phone              text not null,
  -- Pourquoi ce profil est surveillé : 'delivered' (a reçu un message) ou 'replied' (a déjà répondu).
  reason             text not null default 'delivered',
  watch_until        timestamptz not null,
  last_polled_at     timestamptz,
  poll_count         integer not null default 0,
  last_message_id    text,
  created_at         timestamptz not null default now()
);

comment on table public.whatsapp_watchlist is
  'File de polling WhatsApp. Éphémère : une ligne vit au plus 26 h (watch_until), purgée ensuite.';

create index if not exists whatsapp_watchlist_due_idx
  on public.whatsapp_watchlist (watch_until, last_polled_at nulls first);

alter table public.whatsapp_watchlist enable row level security;
-- Aucune policy : seul le service_role (routes /api) y accède, comme le reste du schéma.

-- 4. Purge. À brancher sur un cron quotidien (pg_cron) ou sur /api/cron/daily.
create or replace function public.purge_whatsapp_expired()
returns table (watchlist_deleted bigint, conversations_deleted bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  w bigint;
  c bigint;
begin
  delete from whatsapp_watchlist where watch_until < now();
  get diagnostics w = row_count;

  delete from chat_conversations
   where channel = 'whatsapp'
     and coalesce(last_message_at, created_at) < now() - interval '90 days';
  get diagnostics c = row_count;

  return query select w, c;
end;
$$;

commit;
