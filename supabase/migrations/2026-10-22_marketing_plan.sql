-- Planning marketing (emails + Black Friday + site + pubs Meta), alimenté par Pilotage (Claude Code),
-- affiché dans Calendrier > Planning marketing, validé par l'équipe (Sophie…) depuis le Companion.
-- Accès : service_role uniquement (routes /api), RLS activée sans policy (cf. CLAUDE.md §8).

create table if not exists public.marketing_plan_items (
  id           text primary key,                 -- ex. "fr-07-hair-force-r2-2310" ou "op-fr-2026-11-02-memo-3-pour-2"
  market       text not null check (market in ('fr','uk','us')),
  kind         text not null check (kind in ('email','operation')),
  canal        text,                             -- operation : bf | site | meta
  date_start   date,
  date_label   text,                             -- texte affiché (« 23 oct. → 20 nov. », « 2026-11-24 → 30 (indicatif) »)
  heure        text,
  title        text not null,                    -- sujet de l'email ou titre de l'opération
  payload      jsonb not null default '{}'::jsonb, -- tout le reste (cible, préheader, produits, offre, objectif, statut, détail…)
  preview_url  text,                             -- aperçu JPEG (Storage public)
  pdf_url      text,                             -- PDF (Storage public)
  active       boolean not null default true,    -- false = retiré du planning (jamais supprimé)
  updated_at   timestamptz not null default now()
);
create index if not exists marketing_plan_items_market_date on public.marketing_plan_items (market, date_start);

create table if not exists public.marketing_plan_reviews (
  id             uuid primary key default gen_random_uuid(),
  item_id        text not null references public.marketing_plan_items(id) on delete cascade,
  decision       text not null check (decision in ('valide','retours')),
  comment        text,
  reviewer_email text,
  reviewer_id    uuid,
  created_at     timestamptz not null default now(),
  processed      boolean not null default false, -- traité par Pilotage (brouillon créé / maquette refaite)
  processed_at   timestamptz,
  processed_note text
);
create index if not exists marketing_plan_reviews_item on public.marketing_plan_reviews (item_id, created_at desc);
create index if not exists marketing_plan_reviews_todo on public.marketing_plan_reviews (processed) where processed = false;

alter table public.marketing_plan_items enable row level security;
alter table public.marketing_plan_reviews enable row level security;

-- Bucket public en lecture pour les aperçus et PDF des maquettes (écriture : service_role).
insert into storage.buckets (id, name, public) values ('marketing-plan', 'marketing-plan', true)
on conflict (id) do nothing;
