-- ============================================================
-- Talika Management Platform - Database Schema
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- AGENT SYSTEM
-- ============================================================

CREATE TABLE agent_insights (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_type TEXT NOT NULL CHECK (agent_type IN ('traffic', 'sales', 'ads', 'klaviyo', 'communication', 'projects', 'coach')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'success', 'critical')),
  category TEXT NOT NULL,
  actionable BOOLEAN DEFAULT false,
  suggested_action TEXT,
  data JSONB,
  dismissed BOOLEAN DEFAULT false,
  actioned BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE agent_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('idle', 'running', 'completed', 'error')),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  tokens_used INTEGER DEFAULT 0,
  insights_generated INTEGER DEFAULT 0,
  error TEXT,
  config JSONB
);

CREATE TABLE agent_configs (
  agent_type TEXT PRIMARY KEY,
  enabled BOOLEAN DEFAULT true,
  schedule TEXT DEFAULT '0 */4 * * *',
  max_tokens INTEGER DEFAULT 4096,
  temperature NUMERIC(3,2) DEFAULT 0.7,
  model TEXT DEFAULT 'claude-sonnet-4-20250514',
  custom_prompt TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INFLUENCERS
-- ============================================================

CREATE TABLE influencers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  email TEXT,
  instagram TEXT,
  tiktok TEXT,
  youtube TEXT,
  platform TEXT NOT NULL DEFAULT 'Instagram',
  followers INTEGER DEFAULT 0,
  tier TEXT CHECK (tier IN ('micro', 'mid', 'macro', 'mega')),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'prospect')),
  payment_type TEXT DEFAULT 'free' CHECK (payment_type IN ('free', 'fixed', 'commission', 'fixed+commission')),
  fixed_fee NUMERIC(10,2),
  commission_rate NUMERIC(5,2),
  rib TEXT,
  invoice_info TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE influencer_discount_codes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  influencer_id UUID REFERENCES influencers(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  is_influencer_code BOOLEAN DEFAULT true, -- false for welcome, SAV codes
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE influencer_sales (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  influencer_id UUID REFERENCES influencers(id) ON DELETE SET NULL,
  discount_code TEXT NOT NULL,
  order_id TEXT NOT NULL,
  order_date TIMESTAMPTZ NOT NULL,
  amount NUMERIC(10,2) NOT NULL,
  commission NUMERIC(10,2),
  synced_from TEXT DEFAULT 'shopify',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE influencer_invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  influencer_id UUID REFERENCES influencers(id) ON DELETE CASCADE,
  period TEXT NOT NULL, -- e.g., '2026-03'
  fixed_amount NUMERIC(10,2) DEFAULT 0,
  commission_amount NUMERIC(10,2) DEFAULT 0,
  total_ht NUMERIC(10,2) NOT NULL,
  total_ttc NUMERIC(10,2) NOT NULL,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid', 'overdue')),
  due_date DATE NOT NULL,
  pdf_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- PROJECTS
-- ============================================================

CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'on_hold', 'completed')),
  progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  start_date DATE,
  end_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE project_tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'on_hold', 'completed')),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  assignee TEXT,
  due_date DATE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- COMMUNICATION CALENDAR
-- ============================================================

CREATE TABLE calendar_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('campaign', 'newsletter', 'social', 'launch', 'event', 'npd')),
  date DATE NOT NULL,
  end_date DATE,
  channels TEXT[] DEFAULT '{}',
  status TEXT DEFAULT 'planned' CHECK (status IN ('planned', 'in_progress', 'completed', 'cancelled')),
  description TEXT,
  assignee TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- P&L
-- ============================================================

CREATE TABLE pnl_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  category TEXT NOT NULL,
  subcategory TEXT,
  amount NUMERIC(12,2) NOT NULL,
  source TEXT DEFAULT 'manual', -- 'manual', 'shopify', 'meta', 'klaviyo'
  editable BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(year, month, category, subcategory)
);

-- ============================================================
-- DATA CACHE (for API responses)
-- ============================================================

CREATE TABLE data_cache (
  key TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  source TEXT NOT NULL, -- 'shopify', 'meta', 'klaviyo', 'google_ads'
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX idx_agent_insights_type ON agent_insights(agent_type);
CREATE INDEX idx_agent_insights_created ON agent_insights(created_at DESC);
CREATE INDEX idx_agent_insights_severity ON agent_insights(severity);
CREATE INDEX idx_agent_runs_type ON agent_runs(agent_type);
CREATE INDEX idx_influencer_sales_code ON influencer_sales(discount_code);
CREATE INDEX idx_influencer_sales_date ON influencer_sales(order_date);
CREATE INDEX idx_project_tasks_project ON project_tasks(project_id);
CREATE INDEX idx_calendar_events_date ON calendar_events(date);
CREATE INDEX idx_pnl_entries_period ON pnl_entries(year, month);
CREATE INDEX idx_data_cache_expires ON data_cache(expires_at);

-- ============================================================
-- SEED: Default agent configs
-- ============================================================

INSERT INTO agent_configs (agent_type, enabled, schedule) VALUES
  ('traffic', true, '0 */4 * * *'),
  ('sales', true, '0 */4 * * *'),
  ('ads', true, '0 */6 * * *'),
  ('klaviyo', true, '0 */6 * * *'),
  ('communication', true, '0 8 * * 1'),
  ('projects', true, '0 9 * * *'),
  ('coach', true, '0 0 * * *');

-- ============================================================
-- SEED: Default projects
-- ============================================================

INSERT INTO projects (name, description, status, progress, start_date, end_date) VALUES
  ('Rebrand Total', 'Refonte complète : homepage, pages produits, packshots', 'in_progress', 25, '2026-01-15', '2026-06-30'),
  ('Migration Full Klaviyo', 'Migration avis, live chat, WhatsApp (depuis Simio)', 'in_progress', 40, '2026-02-01', '2026-05-31'),
  ('Stratégie d''Influence', 'Optimisation du programme influenceurs : tracking, facturation, analytics', 'in_progress', 15, '2026-03-01', '2026-06-30'),
  ('Reporting Global Automatisé', 'P&L automatisé basé sur l''Excel existant', 'not_started', 0, NULL, NULL),
  ('Korak', 'Projet Korak', 'not_started', 0, NULL, NULL),
  ('Amazon 2.0 avec Krooga', 'Relance Amazon avec le partenaire Krooga', 'not_started', 0, NULL, NULL);
