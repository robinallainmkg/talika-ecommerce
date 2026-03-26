
## Mois Shopify manquants à ré-importer (format léger)
Les mois suivants ont échoué car payload trop gros (>750 commandes). À retenter avec format compressé (seulement id, total_price, discount_codes, line_items simplifiés, shipping_lines, created_at) :
- 2024-11 (1042 commandes, 127K€)
- 2024-12 (775 commandes, 75K€)
- 2025-07 à 2025-12 (probablement échoués aussi)
- 2026-01 (1853 commandes, 145K€)
- 2026-02 (1230 commandes, 143K€)
- 2026-03 (1158 commandes, 102K€) — a des données partielles (250 orders seulement)

### Règles pour re-sync :
- Espacer les inserts de 10s minimum
- Compresser : garder ~500 octets/commande au lieu de ~12KB
- Faire de nuit ou quand le Disk IO budget est frais
- Vérifier le budget IO avant de lancer : https://supabase.com/dashboard/project/uvohlnmwiucedehemxrt

### Aussi à faire (pending) :
- Merge des comptes influenceurs dupliqués (LO/Lo, Marine Vignes variants, etc.)
- Assigner ELISA10 à "Et Dieu Crea"
- Ajouter 13000€ de fixed fees à Veronika Loubry
