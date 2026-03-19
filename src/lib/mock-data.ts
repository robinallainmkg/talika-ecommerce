import type {
  AgentInsight,
  TrafficData,
  SalesData,
  ProductPerformance,
  CustomerSegment,
  AdCampaign,
  EmailFlow,
  Newsletter,
  Influencer,
  Project,
  CalendarEvent,
  PnLRow,
} from "@/types"

// ========== Agent Insights ==========
export const mockInsights: AgentInsight[] = [
  {
    id: "1",
    agentType: "traffic",
    title: "Pic de trafic organique depuis Instagram",
    description:
      "Le trafic organique depuis Instagram a augmenté de 34% cette semaine. Les posts sur le Lipocils Expert génèrent le plus d'engagement.",
    severity: "success",
    category: "Traffic",
    actionable: true,
    suggestedAction:
      "Augmenter la fréquence de posts sur Lipocils Expert et créer un Reel dédié",
    createdAt: "2026-03-19T10:00:00Z",
  },
  {
    id: "2",
    agentType: "sales",
    title: "Baisse de conversion sur mobile",
    description:
      "Le taux de conversion mobile est passé de 2.1% à 1.6% cette semaine. La page produit Lipocils Expert met 4.2s à charger sur mobile.",
    severity: "warning",
    category: "Ventes",
    actionable: true,
    suggestedAction:
      "Optimiser les images produit et réduire le poids de la page",
    createdAt: "2026-03-19T09:30:00Z",
  },
  {
    id: "3",
    agentType: "ads",
    title: "ROAS campagne Retinol en dessous du seuil",
    description:
      "La campagne Meta Ads 'Retinol Spring' affiche un ROAS de 1.8x, en dessous de l'objectif de 3x. Le CPC est trop élevé sur le ciblage actuel.",
    severity: "critical",
    category: "Ads",
    actionable: true,
    suggestedAction:
      "Resserrer le ciblage 25-45 ans, tester un nouveau visuel UGC, réduire le budget de 20%",
    createdAt: "2026-03-19T08:00:00Z",
  },
  {
    id: "4",
    agentType: "klaviyo",
    title: "Flow abandon de panier sous-performe",
    description:
      "Le flow d'abandon de panier a un taux d'ouverture de 38% (vs 45% industrie). Le 2ème email du flow a un taux de clic très bas (1.2%).",
    severity: "warning",
    category: "Email",
    actionable: true,
    suggestedAction:
      "A/B test sujet du 2ème email, ajouter un code promo -10% dans le 3ème email",
    createdAt: "2026-03-18T16:00:00Z",
  },
  {
    id: "5",
    agentType: "sales",
    title: "Top produit : Lipocils Expert",
    description:
      "Lipocils Expert représente 35% du CA ce mois. Le bundle Lipocils + Eyebrow Lipocil convertit 2x mieux que le produit seul.",
    severity: "info",
    category: "Ventes",
    actionable: true,
    suggestedAction:
      "Mettre en avant le bundle sur la homepage et dans les campagnes Meta",
    createdAt: "2026-03-18T14:00:00Z",
  },
  {
    id: "6",
    agentType: "klaviyo",
    title: "Opportunité : Flow post-achat manquant",
    description:
      "Aucun flow de cross-sell post-achat n'est configuré. Les clients qui achètent Lipocils ont 40% de chance d'acheter un soin contour des yeux.",
    severity: "info",
    category: "Email",
    actionable: true,
    suggestedAction:
      "Créer un flow post-achat J+7 avec recommandation contour des yeux",
    createdAt: "2026-03-18T12:00:00Z",
  },
]

// ========== Traffic Data ==========
export const mockTrafficData: TrafficData[] = Array.from({ length: 30 }, (_, i) => ({
  date: new Date(2026, 2, i + 1).toISOString().split("T")[0],
  sessions: Math.floor(800 + Math.random() * 600),
  pageviews: Math.floor(2000 + Math.random() * 1500),
  bounceRate: 35 + Math.random() * 20,
  avgDuration: 90 + Math.random() * 120,
  source: ["organic", "paid", "social", "direct", "email"][Math.floor(Math.random() * 5)],
}))

export const trafficBySource = [
  { source: "Organic Search", sessions: 12500, percentage: 35 },
  { source: "Paid Social", sessions: 8200, percentage: 23 },
  { source: "Direct", sessions: 6100, percentage: 17 },
  { source: "Social Organic", sessions: 5300, percentage: 15 },
  { source: "Email", sessions: 2800, percentage: 8 },
  { source: "Referral", sessions: 700, percentage: 2 },
]

// ========== Sales Data ==========
export const mockSalesData: SalesData[] = Array.from({ length: 30 }, (_, i) => ({
  date: new Date(2026, 2, i + 1).toISOString().split("T")[0],
  revenue: Math.floor(2000 + Math.random() * 5000),
  orders: Math.floor(20 + Math.random() * 40),
  aov: Math.floor(45 + Math.random() * 30),
  conversionRate: 1.5 + Math.random() * 2,
}))

export const mockProducts: ProductPerformance[] = [
  { id: "1", name: "Lipocils Expert", sku: "LCE-001", revenue: 45200, unitsSold: 1120, conversionRate: 4.2, returnRate: 2.1 },
  { id: "2", name: "Eyebrow Lipocil", sku: "EBL-001", revenue: 28300, unitsSold: 780, conversionRate: 3.8, returnRate: 1.8 },
  { id: "3", name: "Light Therapy By Talika", sku: "LTB-001", revenue: 22100, unitsSold: 340, conversionRate: 2.9, returnRate: 3.2 },
  { id: "4", name: "Eye Decompress", sku: "EDC-001", revenue: 18500, unitsSold: 520, conversionRate: 3.1, returnRate: 1.5 },
  { id: "5", name: "Lash Conditioning Cleanser", sku: "LCC-001", revenue: 12800, unitsSold: 640, conversionRate: 2.4, returnRate: 1.2 },
  { id: "6", name: "Skin Retouch", sku: "SKR-001", revenue: 9800, unitsSold: 280, conversionRate: 1.9, returnRate: 4.1 },
  { id: "7", name: "Bio Enzymes Mask", sku: "BEM-001", revenue: 8200, unitsSold: 410, conversionRate: 2.2, returnRate: 0.8 },
  { id: "8", name: "Eye Therapy Patch", sku: "ETP-001", revenue: 7400, unitsSold: 370, conversionRate: 2.0, returnRate: 1.1 },
]

export const mockCustomerSegments: CustomerSegment[] = [
  { name: "Nouveaux clients", count: 1200, revenue: 54000, aov: 45, repeatRate: 0 },
  { name: "Clients fidèles (2-5 achats)", count: 680, revenue: 47600, aov: 70, repeatRate: 65 },
  { name: "VIP (5+ achats)", count: 180, revenue: 27000, aov: 95, repeatRate: 88 },
  { name: "Inactifs (>6 mois)", count: 2400, revenue: 0, aov: 0, repeatRate: 12 },
]

// ========== Meta Ads ==========
export const mockCampaigns: AdCampaign[] = [
  { id: "1", name: "Lipocils Expert - Printemps", status: "active", objective: "Conversions", budget: 5000, spend: 3200, impressions: 450000, clicks: 12500, ctr: 2.78, cpc: 0.26, conversions: 320, roas: 4.2, product: "Lipocils Expert" },
  { id: "2", name: "Retinol Spring Campaign", status: "active", objective: "Conversions", budget: 3000, spend: 2100, impressions: 280000, clicks: 6800, ctr: 2.43, cpc: 0.31, conversions: 95, roas: 1.8, product: "Retinol" },
  { id: "3", name: "Light Therapy - Awareness", status: "active", objective: "Reach", budget: 2000, spend: 1500, impressions: 520000, clicks: 8200, ctr: 1.58, cpc: 0.18, conversions: 45, roas: 2.1, product: "Light Therapy" },
  { id: "4", name: "Remarketing - Abandon Panier", status: "active", objective: "Conversions", budget: 1500, spend: 980, impressions: 85000, clicks: 4200, ctr: 4.94, cpc: 0.23, conversions: 180, roas: 6.8 },
  { id: "5", name: "Eyebrow Lipocil - UGC", status: "paused", objective: "Conversions", budget: 2500, spend: 2500, impressions: 340000, clicks: 9800, ctr: 2.88, cpc: 0.26, conversions: 210, roas: 3.5, product: "Eyebrow Lipocil" },
  { id: "6", name: "Bio Enzymes Mask - Test", status: "active", objective: "Conversions", budget: 1000, spend: 420, impressions: 62000, clicks: 1800, ctr: 2.90, cpc: 0.23, conversions: 28, roas: 2.8, product: "Bio Enzymes Mask" },
]

// ========== Klaviyo ==========
export const mockFlows: EmailFlow[] = [
  { id: "1", name: "Welcome Series", status: "live", recipients: 8500, openRate: 52.3, clickRate: 8.2, revenue: 12400, conversionRate: 3.1 },
  { id: "2", name: "Abandon de panier", status: "live", recipients: 4200, openRate: 38.1, clickRate: 4.5, revenue: 28600, conversionRate: 5.8 },
  { id: "3", name: "Post-achat", status: "live", recipients: 3100, openRate: 45.2, clickRate: 6.1, revenue: 8200, conversionRate: 2.4 },
  { id: "4", name: "Browse Abandonment", status: "live", recipients: 6800, openRate: 32.5, clickRate: 3.2, revenue: 5600, conversionRate: 1.8 },
  { id: "5", name: "Win-back 90 jours", status: "live", recipients: 2100, openRate: 28.4, clickRate: 2.8, revenue: 3200, conversionRate: 1.2 },
  { id: "6", name: "Anniversaire", status: "draft", recipients: 0, openRate: 0, clickRate: 0, revenue: 0, conversionRate: 0 },
]

export const mockNewsletters: Newsletter[] = [
  { id: "1", subject: "Nouveauté : Découvrez notre gamme Rétinol", sentAt: "2026-03-15", recipients: 45000, openRate: 28.5, clickRate: 4.2, revenue: 8500 },
  { id: "2", subject: "🌸 Offre Printemps -20% sur Lipocils", sentAt: "2026-03-10", recipients: 45000, openRate: 35.2, clickRate: 6.8, revenue: 15200 },
  { id: "3", subject: "Les secrets d'un regard sublimé", sentAt: "2026-03-05", recipients: 44500, openRate: 24.1, clickRate: 3.1, revenue: 4200 },
  { id: "4", subject: "Votre routine soin du regard", sentAt: "2026-02-28", recipients: 44000, openRate: 26.8, clickRate: 3.8, revenue: 5800 },
]

// ========== Influencers ==========
export const mockInfluencers: Influencer[] = [
  { id: "1", name: "Marie Beauté", email: "marie@beauty.com", instagram: "@mariebeaute", platform: "Instagram", followers: 125000, tier: "mid", status: "active", paymentType: "fixed+commission", fixedFee: 500, commissionRate: 10, discountCodes: ["MARIE15"], totalSales: 42, totalRevenue: 3200, createdAt: "2025-06-01" },
  { id: "2", name: "Léa Skincare", email: "lea@skin.com", instagram: "@leaskincare", tiktok: "@leaskincare", platform: "Instagram", followers: 89000, tier: "mid", status: "active", paymentType: "commission", commissionRate: 15, discountCodes: ["LEA20"], totalSales: 28, totalRevenue: 2100, createdAt: "2025-08-15" },
  { id: "3", name: "Sophie Eyes", email: "sophie@eyes.fr", instagram: "@sophieeyes", platform: "Instagram", followers: 320000, tier: "macro", status: "active", paymentType: "fixed", fixedFee: 1500, discountCodes: ["SOPHIE10"], totalSales: 85, totalRevenue: 6800, createdAt: "2025-03-01" },
  { id: "4", name: "Emma Glow", instagram: "@emmaglow", platform: "TikTok", followers: 45000, tier: "micro", status: "active", paymentType: "free", discountCodes: ["EMMA10"], totalSales: 12, totalRevenue: 720, createdAt: "2025-11-01" },
  { id: "5", name: "Julie Beauty Tips", email: "julie@beautytips.com", instagram: "@juliebeautytips", platform: "YouTube", followers: 210000, tier: "macro", status: "inactive", paymentType: "fixed+commission", fixedFee: 800, commissionRate: 8, discountCodes: ["JULIE15"], totalSales: 65, totalRevenue: 4900, createdAt: "2024-12-01" },
]

// ========== Projects ==========
export const mockProjects: Project[] = [
  {
    id: "1",
    name: "Rebrand Total",
    description: "Refonte complète : homepage, pages produits, packshots",
    status: "in_progress",
    progress: 25,
    startDate: "2026-01-15",
    endDate: "2026-06-30",
    tasks: [
      { id: "1-1", projectId: "1", title: "Maquette homepage v2", status: "in_progress", priority: "high", assignee: "Design" },
      { id: "1-2", projectId: "1", title: "Template page produit", status: "not_started", priority: "high", assignee: "Design" },
      { id: "1-3", projectId: "1", title: "Shooting packshots", status: "not_started", priority: "medium", assignee: "Photo" },
      { id: "1-4", projectId: "1", title: "Intégration Shopify", status: "not_started", priority: "high", assignee: "Dev" },
    ],
  },
  {
    id: "2",
    name: "Migration Full Klaviyo",
    description: "Migration avis, live chat, WhatsApp (depuis Simio)",
    status: "in_progress",
    progress: 40,
    startDate: "2026-02-01",
    endDate: "2026-05-31",
    tasks: [
      { id: "2-1", projectId: "2", title: "Migration avis produits", status: "in_progress", priority: "high" },
      { id: "2-2", projectId: "2", title: "Setup live chat Klaviyo", status: "not_started", priority: "medium" },
      { id: "2-3", projectId: "2", title: "Migration WhatsApp (Simio → Klaviyo)", status: "not_started", priority: "high" },
      { id: "2-4", projectId: "2", title: "Configuration flows WhatsApp", status: "not_started", priority: "medium" },
    ],
  },
  {
    id: "3",
    name: "Stratégie d'Influence",
    description: "Optimisation du programme influenceurs : tracking, facturation, analytics",
    status: "in_progress",
    progress: 15,
    startDate: "2026-03-01",
    endDate: "2026-06-30",
    tasks: [
      { id: "3-1", projectId: "3", title: "Import CSV influenceurs", status: "completed", priority: "high" },
      { id: "3-2", projectId: "3", title: "Dashboard tracking codes promo", status: "in_progress", priority: "high" },
      { id: "3-3", projectId: "3", title: "Système de facturation", status: "not_started", priority: "medium" },
      { id: "3-4", projectId: "3", title: "Enrichissement profils (social stats)", status: "not_started", priority: "low" },
    ],
  },
  {
    id: "4",
    name: "Reporting Global Automatisé",
    description: "P&L automatisé basé sur l'Excel existant",
    status: "not_started",
    progress: 0,
    tasks: [
      { id: "4-1", projectId: "4", title: "Structure P&L dans le dashboard", status: "not_started", priority: "high" },
      { id: "4-2", projectId: "4", title: "Connexion données Shopify", status: "not_started", priority: "high" },
      { id: "4-3", projectId: "4", title: "Input manuel des données manquantes", status: "not_started", priority: "medium" },
    ],
  },
  {
    id: "5",
    name: "Korak",
    description: "Projet Korak",
    status: "not_started",
    progress: 0,
    tasks: [],
  },
  {
    id: "6",
    name: "Amazon 2.0 avec Krooga",
    description: "Relance Amazon avec le partenaire Krooga",
    status: "not_started",
    progress: 0,
    tasks: [],
  },
]

// ========== Calendar Events ==========
export const mockCalendarEvents: CalendarEvent[] = [
  { id: "1", title: "Newsletter Printemps", type: "newsletter", date: "2026-03-20", channel: ["email"], status: "planned", assignee: "Marketing" },
  { id: "2", title: "Campagne Lipocils Expert", type: "campaign", date: "2026-03-22", endDate: "2026-04-05", channel: ["meta", "google"], status: "planned" },
  { id: "3", title: "Lancement Rétinol Sérum", type: "launch", date: "2026-04-01", channel: ["email", "meta", "social"], status: "planned", description: "NPD - Nouveau sérum rétinol" },
  { id: "4", title: "Post Instagram - Routine Regard", type: "social", date: "2026-03-21", channel: ["instagram"], status: "planned" },
  { id: "5", title: "Collab Influenceur Marie Beauté", type: "campaign", date: "2026-03-25", channel: ["instagram"], status: "planned", assignee: "Diane" },
  { id: "6", title: "Newsletter Fête des Mères", type: "newsletter", date: "2026-05-15", channel: ["email"], status: "planned" },
  { id: "7", title: "Soldes d'été", type: "campaign", date: "2026-06-25", endDate: "2026-07-15", channel: ["email", "meta", "google"], status: "planned" },
]

// ========== P&L ==========
export const mockPnLData: PnLRow[] = [
  { category: "Chiffre d'affaires", subcategory: "Ventes Shopify", jan: 95000, feb: 88000, mar: 102000 },
  { category: "Chiffre d'affaires", subcategory: "Ventes Amazon", jan: 12000, feb: 11500 },
  { category: "Chiffre d'affaires", subcategory: "Ventes B2B" },
  { category: "Coûts des ventes", subcategory: "COGS", jan: -28500, feb: -26400, mar: -30600 },
  { category: "Coûts des ventes", subcategory: "Shipping", jan: -8500, feb: -7800, mar: -9100 },
  { category: "Marketing", subcategory: "Meta Ads", jan: -12000, feb: -11000, mar: -14000 },
  { category: "Marketing", subcategory: "Google Ads", jan: -5000, feb: -4500, mar: -6000 },
  { category: "Marketing", subcategory: "Influenceurs", jan: -3500, feb: -2800, mar: -4200 },
  { category: "Marketing", subcategory: "Klaviyo", jan: -800, feb: -800, mar: -800 },
  { category: "Opérations", subcategory: "Shopify fees", jan: -2850, feb: -2640, mar: -3060 },
  { category: "Opérations", subcategory: "Apps & Tools", jan: -1200, feb: -1200, mar: -1200 },
  { category: "Opérations", subcategory: "Salaires", editable: true },
  { category: "Opérations", subcategory: "Loyer & Charges", editable: true },
]
