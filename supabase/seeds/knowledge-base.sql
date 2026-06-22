-- Seed knowledge_base — contexte business durable injecté dans les prompts Claude Code
-- (via src/lib/context-pack.ts → /api/context). Source unique de vérité métier.
--
-- RÈGLE D'INTÉGRITÉ : on ne seed QUE des entrées ancrées dans une source réelle
-- (CLAUDE.md, code des insights, mémoire projet, src/lib/generosite.ts, data réelle)
-- ou validées par Robin. Idempotent : on supprime les clés gérées puis on réinsère.
-- Scope : market='FR', channel='shopify' (NULL = global, vaut pour tous).

BEGIN;

DELETE FROM knowledge_base WHERE key = ANY(ARRAY[
  'rule:claims-source','rule:ask-before-send','rule:no-paid-llm','rule:roas-benchmark',
  'rule:generosite-scope','rule:influence-band','rule:aov-target',
  'glossary:roas','glossary:code-categories','glossary:roas-vs-profit',
  'playbook:post-achat-flows','playbook:dead-ads','playbook:generosite-reduction','playbook:ads-scaling',
  'playbook:influence-boost','playbook:incrementality',
  'strategy:retention-devices','strategy:hero-products','strategy:acquisition-nc','strategy:attribution-blend'
]);

INSERT INTO knowledge_base (type, key, title, content, payload, market, channel, tags, pages, priority) VALUES

-- ── RÈGLES MÉTIER ──
('rule', 'rule:claims-source', 'Claims produit : jamais inventés',
 'Ne JAMAIS inventer de bénéfice ou de résultat chiffré produit. Source unique = fiches Shopify + études cliniques réelles (déjà indexées dans la KB du chat : métafields Accentuate advice/results/ingredients). Toujours vérifier avant d''affirmer un chiffre.',
 '{}'::jsonb, NULL, NULL, ARRAY['claims','integrity'], ARRAY[]::text[], 96),

('rule', 'rule:ask-before-send', 'Demander avant tout envoi externe',
 'Demander validation à Robin avant d''envoyer quoi que ce soit vers l''extérieur (email, campagne, message client, post). L''app propose, l''humain valide.',
 '{}'::jsonb, NULL, NULL, ARRAY['ops','safety'], ARRAY[]::text[], 90),

('rule', 'rule:no-paid-llm', 'Intelligence = Claude Code, pas de LLM facturé dans l''app',
 'L''intelligence vient de Claude Code (abonnement flat) raisonnant sur le contexte fourni par la plateforme. Ne pas réintroduire d''API LLM facturée à l''usage. Le chat SAV utilise Mistral (souverain UE, déjà payé).',
 '{}'::jsonb, NULL, NULL, ARRAY['architecture'], ARRAY[]::text[], 70),

('rule', 'rule:roas-benchmark', 'Lecture du ROAS ads',
 'ROAS Meta : cible 5. < 2 = alerte (peu/pas rentable). Google Ads variable selon campagne (marque vs acquisition). ROAS = CA attribué ÷ dépense = CA BRUT, pas profit (marge/COGS produit pas encore captée).',
 '{"meta_roas_alert": 2, "meta_roas_target": 5}'::jsonb, 'FR', NULL, ARRAY['ads','roas','benchmark'], ARRAY['acquisition','ads'], 85),

('rule', 'rule:generosite-scope', 'Périmètre du calcul de générosité',
 'Générosité = remises ÷ CA. SAV (service_client) EXCLU. Codes influenceurs INCLUS mais stratégiques : NE PAS les couper pour faire baisser le taux. Calcul canonique = src/lib/generosite.ts (table-driven via influencer_codes.code_type). Pas de plancher de discount par code : la générosité se pilote au global.',
 '{}'::jsonb, 'FR', NULL, ARRAY['generosite'], ARRAY['generosite','dashboard','sales'], 88),

('rule', 'rule:influence-band', 'Bande saine de la part influence',
 'Part du CA générée par l''influence : sainement entre 10% et 30%. En dessous = levier sous-exploité ; au-dessus = dépendance à surveiller. L''influence est l''arme secrète Talika — ne jamais la réduire mécaniquement.',
 '{"healthy_min_pct": 10, "healthy_max_pct": 30}'::jsonb, 'FR', NULL, ARRAY['influence','acquisition'], ARRAY['influencers','acquisition','generosite'], 88),

('rule', 'rule:aov-target', 'AOV cible 2026 : +5% vs 2025',
 'Cible AOV 2026 = AOV 2025 réel (97,99 €) + 5% = 102,89 €. Formule réutilisable : AOV même période N-1 × 1,05. Calculé depuis les commandes 2025 (12 133 cmd, 1 188 907 € hors annulées).',
 '{"aov_2025": 97.99, "aov_target_2026": 102.89, "uplift_pct": 5, "formula": "aov_ly * 1.05"}'::jsonb, 'FR', 'shopify', ARRAY['aov','objectives','benchmark'], ARRAY['dashboard','sales'], 84),

-- ── GLOSSAIRE ──
('glossary', 'glossary:roas', 'ROAS',
 'Return On Ad Spend = CA attribué à la pub ÷ dépense publicitaire. Mesure l''efficacité d''un canal/campagne. Talika : cible Meta 5, seuil d''alerte 2.',
 '{}'::jsonb, 'FR', NULL, ARRAY['ads','definition'], ARRAY['acquisition','ads'], 60),

('glossary', 'glossary:roas-vs-profit', 'ROAS ≠ rentabilité',
 'Un bon ROAS ne garantit pas la rentabilité : il compare le CA (pas la marge) à la dépense. Tant que la marge produit (COGS) n''est pas captée, optimiser au ROAS = optimiser au CA, pas au profit.',
 '{}'::jsonb, 'FR', NULL, ARRAY['ads','profit','definition'], ARRAY['acquisition','ads','pnl'], 58),

('glossary', 'glossary:code-categories', 'Catégories de codes promo',
 'influencer_codes.code_type : influencer (influence), welcome (acquisition générique), gifting (dotations MKG), offre_site (promos site), auto_discounts (volume), logistique (erreurs La Poste), service_client (SAV — EXCLU de la générosité), autre.',
 '{}'::jsonb, 'FR', 'shopify', ARRAY['codes','generosite'], ARRAY['generosite','influencers'], 60),

-- ── PLAYBOOKS ──
('playbook', 'playbook:post-achat-flows', 'Flows post-achat = moteur de rétention',
 'Prioriser les flows Klaviyo post-achat sur les 3 appareils (moteur de rétention). 3 flows cadrés : TC7+, Hair Cap, LED Mask — objectif usage correct + rachat. Détails : mémoire project_postpurchase_flows.',
 '{}'::jsonb, 'FR', NULL, ARRAY['retention','flows','email'], ARRAY['klaviyo','chat'], 75),

('playbook', 'playbook:dead-ads', 'Détecter et traiter les dead ads',
 'Une ad avec dépense > 50€ sur le mois et 0 achat = candidate à couper ou réoptimiser. Avant de couper : vérifier le mapping ad→produit (ad_product_mappings) et la landing page.',
 '{"dead_spend_threshold_eur": 50}'::jsonb, 'FR', NULL, ARRAY['ads'], ARRAY['ads','acquisition'], 72),

('playbook', 'playbook:ads-scaling', 'Scaling d''une ad gagnante',
 'Une ad au ROAS > 5 avec volume significatif = candidate à scaler (augmenter le budget par paliers, surveiller la stabilité du ROAS sur 3-4 jours). Diversifier les créas avant de saturer l''audience.',
 '{}'::jsonb, 'FR', NULL, ARRAY['ads','scaling'], ARRAY['ads','acquisition'], 70),

('playbook', 'playbook:generosite-reduction', 'Réduire la générosité SANS toucher l''influence',
 'Pour baisser le taux de générosité : agir sur les codes welcome / offre_site / auto_discounts, jamais sur l''influence. Identifier d''abord le 1er poste de remise hors-influence (page Générosité → décomposition par catégorie).',
 '{}'::jsonb, 'FR', NULL, ARRAY['generosite'], ARRAY['generosite'], 72),

('playbook', 'playbook:influence-boost', 'Contenu influenceur boosté = bucket hybride',
 'Quand on met du budget pub derrière une créa d''influenceur, c''est un bucket HYBRIDE : le coût est de la dépense Meta, l''origine créative est l''influence. Ne le compter NI en influence pure (qui n''a pas de coût média) NI en Meta pur. À tagger distinctement — prévoir une convention de nommage d''ad (ex. préfixe INFL_) pour que l''analyse le sépare.',
 '{}'::jsonb, 'FR', NULL, ARRAY['attribution','influence','ads','boost'], ARRAY['ads','acquisition','influencers'], 80),

('playbook', 'playbook:incrementality', 'Valoriser un canal malgré l''entremêlement (incrémentalité)',
 'Pour savoir ce qu''un canal apporte VRAIMENT malgré l''entremêlement : regarder le TOTAL (nouveaux clients, CA global), pas le ROAS plateforme. Test naturel : si l''influence s''arrête et que le total de nouveaux clients baisse peu pendant que Meta "récupère" à un ROAS pire, alors l''influence était incrémentale et Meta s''attribuait le crédit. Utiliser les pauses d''influence comme expériences on/off.',
 '{}'::jsonb, 'FR', NULL, ARRAY['attribution','incrementality','test'], ARRAY['acquisition','ads','dashboard'], 82),

-- ── STRATÉGIE ──
('strategy', 'strategy:attribution-blend', 'Attribution : ne pas sommer les ROAS, boussole = MER + CAC nouveau client',
 'Ne JAMAIS additionner les ROAS plateformes (Meta + influence) : double comptage. Meta SUR-attribue, surtout quand l''influence tourne — son pixel revendique des conversions amorcées par l''influence. Quand l''influence s''arrête, le ROAS Meta chute : preuve qu''il empruntait. Boussole anti-attribution à privilégier : MER = CA total ÷ dépense marketing totale, et CAC nouveau client = dépense acquisition ÷ nb de nouveaux clients. Le ROAS d''une plateforme reste DIRECTIONNEL, jamais sommé entre canaux.',
 '{}'::jsonb, 'FR', NULL, ARRAY['attribution','roas','mer','cac'], ARRAY['acquisition','ads','dashboard'], 91),

('strategy', 'strategy:hero-products', 'Produits prioritaires 2026 (hero)',
 'Concentrer ads, CRO et flows sur : LED Mask · la nouveauté Brume Vitamine C · les masques (tous) · les mascaras (tous) · les Eye Therapy Patch (tous). Produits à pousser et analyser en priorité.',
 '{"heroes": ["LED Mask","Brume Vitamine C (nouveauté)","Masques (tous)","Mascaras (tous)","Eye Therapy Patch (tous)"]}'::jsonb, 'FR', 'shopify', ARRAY['product','hero','priority'], ARRAY['dashboard','sales','ads','acquisition','klaviyo'], 86),

('strategy', 'strategy:acquisition-nc', 'Vraie acquisition = % nouveaux clients + ROAS, par canal séparément',
 'Ne PAS mélanger les canaux dans un ROAS global : Meta et influence ont des attributions différentes. Mesurer pour CHAQUE canal : (1) % de NOUVEAUX clients (NC = 1re commande jamais passée pour cet email) et (2) ROAS. Meta = cible ROAS 5. Google et autres canaux apportent peu d''acquisition réelle. L''influence est attribuable précisément (code → influenceur) ; Meta est attribué au pixel (chevauchement possible).',
 '{"meta_roas_target": 5, "definition_nc": "1re commande jamais passee pour un email"}'::jsonb, 'FR', NULL, ARRAY['acquisition','nc','roas','influence'], ARRAY['acquisition','ads','dashboard'], 89),

('strategy', 'strategy:retention-devices', 'Les appareils tirent la rétention',
 'Les 3 appareils (~293 K€) sont le moteur de rétention : forte valeur, usage répété, base de cross-sell soins. Toute analyse rétention/flows/CRO doit les considérer en priorité.',
 '{}'::jsonb, 'FR', 'shopify', ARRAY['retention','product','devices'], ARRAY['dashboard','sales','klaviyo'], 82);

COMMIT;
