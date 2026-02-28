export type PipelineStage =
  | 'new'
  | 'go'
  | 'building'
  | 'ready'
  | 'applied'
  | 'replied'
  | 'won'
  | 'lost'
  | 'rejected'
  | 'waiting'

export type AiVerdict = 'GO' | 'NO-GO' | 'NEEDS_REVIEW' | 'pending'

export type BuildType = 'build' | 'loom_only' | null

export type BuildStatus = 'pending' | 'building' | 'done'

export interface Job {
  id: string
  title: string
  description_snippet: string | null
  full_description: string | null
  upwork_link: string | null
  budget_type: string | null
  budget_min: number | null
  budget_max: number | null
  budget_display: string | null
  hourly_rate_display: string | null
  client_location: string | null
  client_spend: string | null
  client_rating: string | null
  client_hires: number | null
  proposals_count: string | null
  has_hire: boolean
  skills: string[] | null
  posted_at: string | null
  job_category: string | null
  saved_search_id: string | null
  ai_score: number | null
  ai_verdict: AiVerdict
  ai_reasoning: string | null
  ai_potential: string | null
  ai_estimated_effort: string | null
  deep_vet_score: number | null
  deep_vet_verdict: string | null
  deep_vet_reasoning: string | null
  deep_vet_approach: string | null
  deep_vet_risks: string | null
  deep_vet_opportunities: string | null
  build_type: BuildType
  build_status: string | null
  demo_url: string | null
  demo_token: string | null
  demo_password: string | null
  claude_code_prompt: string | null
  loom_script: string | null
  loom_link: string | null
  proposal_text: string | null
  pipeline_stage: PipelineStage
  verdict_override: string | null
  rejection_reason: string | null
  client_reply: string | null
  client_reply_draft: string | null
  dedup_hash: string | null
  is_blocked: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

export interface SavedSearch {
  id: string
  name: string
  search_query: string | null
  filters: Record<string, unknown>
  notes: string | null
  total_jobs_found: number
  total_go: number
  total_no_go: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface JobHistory {
  id: string
  job_id: string
  action: string
  old_value: string | null
  new_value: string | null
  details: string | null
  created_at: string
}

export interface RunHistory {
  id: string
  saved_search_id: string | null
  saved_search_name: string | null
  total_pasted: number
  total_parsed: number
  total_go: number
  total_no_go: number
  total_review: number
  total_blocked: number
  total_pre_filtered: number
  duration_ms: number | null
  created_at: string
}

export interface BlockListEntry {
  id: string
  title: string
  description_snippet: string | null
  dedup_hash: string | null
  reason: string | null
  source_saved_search_id: string | null
  created_at: string
}

export interface ParsedJob {
  title: string
  description_snippet: string | null
  budget_display: string | null
  budget_type: 'fixed' | 'hourly' | 'unknown'
  client_location: string | null
  client_spend: string | null
  client_rating: string | null
  proposals_count: string | null
  has_hire: boolean
  skills: string[]
  posted_at: string | null
  ai_score: number
  ai_verdict: 'GO' | 'NO-GO' | 'NEEDS_REVIEW'
  ai_reasoning: string
}

export interface ParseResult {
  jobs: ParsedJob[]
  total_found: number
}

export interface DeepVetResult {
  deep_vet_score: number
  deep_vet_verdict: 'GO' | 'NO-GO' | 'NEEDS_REVIEW'
  deep_vet_reasoning: string
  deep_vet_approach: string
  deep_vet_risks: string
  deep_vet_opportunities: string
  ai_estimated_effort: string
}

export interface DashboardStats {
  total_jobs: number
  jobs_this_week: number
  go_rate: number
  active_pipeline: number
  proposals_sent: number
  clients_signed: number
  best_search: { name: string; go_rate: number } | null
  recent_activity: JobHistory[]
}
