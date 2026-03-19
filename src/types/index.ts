// ========== Agent Types ==========
export type AgentType =
  | "traffic"
  | "sales"
  | "ads"
  | "klaviyo"
  | "communication"
  | "projects"
  | "coach"

export type AgentStatus = "idle" | "running" | "completed" | "error"

export interface AgentInsight {
  id: string
  agentType: AgentType
  title: string
  description: string
  severity: "info" | "warning" | "success" | "critical"
  category: string
  actionable: boolean
  suggestedAction?: string
  createdAt: string
  data?: Record<string, unknown>
}

export interface AgentRun {
  id: string
  agentType: AgentType
  status: AgentStatus
  startedAt: string
  completedAt?: string
  tokensUsed?: number
  insightsGenerated: number
  error?: string
}

// ========== Dashboard Types ==========
export interface KPICard {
  label: string
  value: string | number
  change?: number
  changeLabel?: string
  icon?: string
}

// ========== Traffic Types ==========
export interface TrafficData {
  date: string
  sessions: number
  pageviews: number
  bounceRate: number
  avgDuration: number
  source: string
}

// ========== Sales Types ==========
export interface SalesData {
  date: string
  revenue: number
  orders: number
  aov: number
  conversionRate: number
}

export interface ProductPerformance {
  id: string
  name: string
  sku: string
  revenue: number
  unitsSold: number
  conversionRate: number
  returnRate: number
  image?: string
}

export interface CustomerSegment {
  name: string
  count: number
  revenue: number
  aov: number
  repeatRate: number
}

// ========== Meta Ads Types ==========
export interface AdCampaign {
  id: string
  name: string
  status: "active" | "paused" | "ended"
  objective: string
  budget: number
  spend: number
  impressions: number
  clicks: number
  ctr: number
  cpc: number
  conversions: number
  roas: number
  product?: string
}

// ========== Klaviyo Types ==========
export interface EmailFlow {
  id: string
  name: string
  status: "live" | "draft" | "paused"
  recipients: number
  openRate: number
  clickRate: number
  revenue: number
  conversionRate: number
}

export interface Newsletter {
  id: string
  subject: string
  sentAt: string
  recipients: number
  openRate: number
  clickRate: number
  revenue: number
}

// ========== Influencer Types ==========
export interface Influencer {
  id: string
  name: string
  email?: string
  instagram?: string
  tiktok?: string
  youtube?: string
  platform: string
  followers: number
  tier: "micro" | "mid" | "macro" | "mega"
  status: "active" | "inactive" | "prospect"
  paymentType: "free" | "fixed" | "commission" | "fixed+commission"
  fixedFee?: number
  commissionRate?: number
  discountCodes: string[]
  totalSales: number
  totalRevenue: number
  rib?: string
  invoiceInfo?: string
  notes?: string
  createdAt: string
}

export interface InfluencerSale {
  id: string
  influencerId: string
  discountCode: string
  orderId: string
  date: string
  amount: number
  commission?: number
}

export interface InfluencerInvoice {
  id: string
  influencerId: string
  period: string
  fixedAmount: number
  commissionAmount: number
  totalHT: number
  totalTTC: number
  status: "draft" | "sent" | "paid" | "overdue"
  dueDate: string
  createdAt: string
}

// ========== Project Types ==========
export type ProjectStatus = "not_started" | "in_progress" | "on_hold" | "completed"
export type TaskPriority = "low" | "medium" | "high" | "critical"

export interface Project {
  id: string
  name: string
  description: string
  status: ProjectStatus
  progress: number
  startDate?: string
  endDate?: string
  tasks: ProjectTask[]
}

export interface ProjectTask {
  id: string
  projectId: string
  title: string
  description?: string
  status: ProjectStatus
  priority: TaskPriority
  assignee?: string
  dueDate?: string
}

// ========== P&L Types ==========
export interface PnLRow {
  category: string
  subcategory?: string
  jan?: number
  feb?: number
  mar?: number
  apr?: number
  may?: number
  jun?: number
  jul?: number
  aug?: number
  sep?: number
  oct?: number
  nov?: number
  dec?: number
  total?: number
  editable?: boolean
}

// ========== Communication Calendar ==========
export interface CalendarEvent {
  id: string
  title: string
  type: "campaign" | "newsletter" | "social" | "launch" | "event" | "npd"
  date: string
  endDate?: string
  channel: string[]
  status: "planned" | "in_progress" | "completed" | "cancelled"
  description?: string
  assignee?: string
}
