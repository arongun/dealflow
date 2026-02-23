-- Enable trigram for fuzzy dedup
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Saved Searches (mirrors Upwork saved searches + metadata)
CREATE TABLE IF NOT EXISTS saved_searches (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  search_query TEXT,
  filters JSONB DEFAULT '{}',
  notes TEXT,
  total_jobs_found INTEGER DEFAULT 0,
  total_go INTEGER DEFAULT 0,
  total_no_go INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Jobs (the core entity)
CREATE TABLE IF NOT EXISTS jobs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  -- Basic info (from initial parse)
  title TEXT NOT NULL,
  description_snippet TEXT,
  full_description TEXT,
  upwork_link TEXT,
  budget_type TEXT,
  budget_min NUMERIC,
  budget_max NUMERIC,
  budget_display TEXT,
  hourly_rate_display TEXT,
  client_location TEXT,
  client_spend TEXT,
  client_rating TEXT,
  client_hires INTEGER,
  proposals_count TEXT,
  skills TEXT[],
  posted_at TEXT,
  job_category TEXT,
  -- Saved search reference
  saved_search_id UUID REFERENCES saved_searches(id),
  -- AI scoring (from initial parse)
  ai_score NUMERIC,
  ai_verdict TEXT DEFAULT 'pending',
  ai_reasoning TEXT,
  ai_potential TEXT,
  ai_estimated_effort TEXT,
  -- Deep vet (from full description analysis)
  deep_vet_score NUMERIC,
  deep_vet_verdict TEXT,
  deep_vet_reasoning TEXT,
  deep_vet_approach TEXT,
  deep_vet_risks TEXT,
  deep_vet_opportunities TEXT,
  -- Build info
  build_type TEXT,
  build_status TEXT DEFAULT 'pending',
  demo_url TEXT,
  demo_token TEXT,
  demo_password TEXT,
  claude_code_prompt TEXT,
  -- Loom / Proposal
  loom_script TEXT,
  loom_link TEXT,
  proposal_text TEXT,
  -- Pipeline
  pipeline_stage TEXT DEFAULT 'new',
  rejection_reason TEXT,
  client_reply TEXT,
  client_reply_draft TEXT,
  -- Dedup
  dedup_hash TEXT,
  is_blocked BOOLEAN DEFAULT FALSE,
  -- Meta
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Block List (deduplicated / rejected jobs for future matching)
CREATE TABLE IF NOT EXISTS block_list (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description_snippet TEXT,
  dedup_hash TEXT,
  reason TEXT,
  source_saved_search_id UUID REFERENCES saved_searches(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Job History (activity log per job)
CREATE TABLE IF NOT EXISTS job_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  details TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Run History (each daily run session)
CREATE TABLE IF NOT EXISTS run_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  saved_search_id UUID REFERENCES saved_searches(id),
  saved_search_name TEXT,
  total_pasted INTEGER DEFAULT 0,
  total_parsed INTEGER DEFAULT 0,
  total_go INTEGER DEFAULT 0,
  total_no_go INTEGER DEFAULT 0,
  total_review INTEGER DEFAULT 0,
  total_blocked INTEGER DEFAULT 0,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_jobs_title_trgm ON jobs USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_jobs_pipeline_stage ON jobs (pipeline_stage);
CREATE INDEX IF NOT EXISTS idx_jobs_ai_verdict ON jobs (ai_verdict);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_block_list_dedup_hash ON block_list (dedup_hash);
CREATE INDEX IF NOT EXISTS idx_block_list_title_trgm ON block_list USING gin (title gin_trgm_ops);

-- Auto-update trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER jobs_updated_at BEFORE UPDATE ON jobs FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER saved_searches_updated_at BEFORE UPDATE ON saved_searches FOR EACH ROW EXECUTE FUNCTION update_updated_at();
