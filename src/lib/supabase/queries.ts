import { supabase } from "./client"

// ========== AGENTS ==========

export async function getAgents() {
  const { data, error } = await supabase
    .from("agents")
    .select("*")
    .order("id")
  if (error) throw error
  return data
}

export async function getAgentRuns(agentId?: string, limit = 10) {
  let query = supabase
    .from("agent_runs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit)
  if (agentId) query = query.eq("agent_id", agentId)
  const { data, error } = await query
  if (error) throw error
  return data
}

export async function getAgentProposals(agentId?: string, status?: string) {
  let query = supabase
    .from("agent_proposals")
    .select("*")
    .order("created_at", { ascending: false })
  if (agentId) query = query.eq("agent_id", agentId)
  if (status) query = query.eq("status", status)
  const { data, error } = await query
  if (error) throw error
  return data
}

export async function triggerAgentRun(agentId: string, inputData?: Record<string, unknown>) {
  const { data, error } = await supabase
    .from("agent_runs")
    .insert({
      agent_id: agentId,
      status: "pending",
      input_data: inputData || {},
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateProposalStatus(
  proposalId: string,
  status: "approved" | "rejected",
  reviewNotes?: string
) {
  const { data, error } = await supabase
    .from("agent_proposals")
    .update({
      status,
      reviewed_at: new Date().toISOString(),
      review_notes: reviewNotes,
    })
    .eq("id", proposalId)
    .select()
    .single()
  if (error) throw error
  return data
}

// ========== METRICS ==========

export async function getMetrics(source?: string, dateFrom?: string, dateTo?: string) {
  let query = supabase
    .from("metrics_snapshots")
    .select("*")
    .order("date", { ascending: true })
  if (source) query = query.eq("source", source)
  if (dateFrom) query = query.gte("date", dateFrom)
  if (dateTo) query = query.lte("date", dateTo)
  const { data, error } = await query
  if (error) throw error
  return data
}

// ========== INFLUENCERS ==========

export async function getInfluencers() {
  const { data, error } = await supabase
    .from("influencers")
    .select(`
      *,
      discount_codes (*),
      influencer_sales (*)
    `)
    .order("name")
  if (error) throw error
  return data
}

export async function getInfluencer(id: string) {
  const { data, error } = await supabase
    .from("influencers")
    .select(`
      *,
      discount_codes (*),
      influencer_sales (*),
      influencer_invoices (*)
    `)
    .eq("id", id)
    .single()
  if (error) throw error
  return data
}

// ========== PROJECTS ==========

export async function getProjects() {
  const { data, error } = await supabase
    .from("projects")
    .select(`
      *,
      project_tasks (*)
    `)
    .order("created_at", { ascending: false })
  if (error) throw error
  return data
}

export async function getProject(slug: string) {
  const { data, error } = await supabase
    .from("projects")
    .select(`
      *,
      project_tasks (*)
    `)
    .eq("slug", slug)
    .single()
  if (error) throw error
  return data
}

// ========== CALENDAR ==========

export async function getCalendarEvents(from?: string, to?: string) {
  let query = supabase
    .from("calendar_events")
    .select("*")
    .order("scheduled_at", { ascending: true })
  if (from) query = query.gte("scheduled_at", from)
  if (to) query = query.lte("scheduled_at", to)
  const { data, error } = await query
  if (error) throw error
  return data
}

// ========== P&L ==========

export async function getPnLCategories() {
  const { data, error } = await supabase
    .from("pnl_categories")
    .select("*")
    .order("sort_order")
  if (error) throw error
  return data
}

export async function getPnLEntries(dateFrom?: string, dateTo?: string) {
  let query = supabase
    .from("pnl_entries")
    .select(`
      *,
      pnl_categories (*)
    `)
    .order("date", { ascending: true })
  if (dateFrom) query = query.gte("date", dateFrom)
  if (dateTo) query = query.lte("date", dateTo)
  const { data, error } = await query
  if (error) throw error
  return data
}
