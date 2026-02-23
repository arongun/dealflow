import { z } from 'zod'

export const parsedJobSchema = z.object({
  title: z.string(),
  description_snippet: z.string().nullable().optional().default(null),
  budget_display: z.string().nullable().optional().default(null),
  budget_type: z.enum(['fixed', 'hourly', 'unknown']).optional().default('unknown'),
  client_location: z.string().nullable().optional().default(null),
  client_spend: z.string().nullable().optional().default(null),
  client_rating: z.string().nullable().optional().default(null),
  proposals_count: z.string().nullable().optional().default(null),
  skills: z.array(z.string()).optional().default([]),
  posted_at: z.string().nullable().optional().default(null),
  ai_score: z.number().min(1).max(5),
  ai_verdict: z.enum(['GO', 'NO-GO', 'NEEDS_REVIEW']),
  ai_reasoning: z.string(),
})

export const parseResultSchema = z.object({
  jobs: z.array(parsedJobSchema),
  total_found: z.number(),
})

export const deepVetResultSchema = z.object({
  deep_vet_score: z.number().min(1).max(5),
  deep_vet_verdict: z.enum(['GO', 'NO-GO', 'NEEDS_REVIEW']),
  deep_vet_reasoning: z.string(),
  deep_vet_approach: z.string(),
  deep_vet_risks: z.string(),
  deep_vet_opportunities: z.string(),
  ai_estimated_effort: z.string(),
})

export const savedSearchCreateSchema = z.object({
  name: z.string().min(1),
  search_query: z.string().optional().default(''),
  filters: z.record(z.string(), z.unknown()).optional().default({}),
  notes: z.string().optional().default(''),
  is_active: z.boolean().optional().default(true),
})

export const savedSearchUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  search_query: z.string().optional(),
  filters: z.record(z.string(), z.unknown()).optional(),
  notes: z.string().optional(),
  is_active: z.boolean().optional(),
})

export const jobUpdateSchema = z.object({
  pipeline_stage: z
    .enum([
      'new', 'go', 'building', 'ready', 'applied',
      'replied', 'won', 'lost', 'rejected', 'waiting',
    ])
    .optional(),
  build_type: z.enum(['build', 'loom_only']).nullable().optional(),
  build_status: z.enum(['pending', 'building', 'done']).optional(),
  upwork_link: z.string().optional(),
  full_description: z.string().optional(),
  demo_url: z.string().optional(),
  demo_token: z.string().optional(),
  demo_password: z.string().optional(),
  loom_link: z.string().optional(),
  notes: z.string().optional(),
  verdict_override: z.enum(['GO', 'NO-GO', 'NEEDS_REVIEW']).nullable().optional(),
  rejection_reason: z.string().optional(),
  client_reply: z.string().optional(),
  claude_code_prompt: z.string().optional(),
  loom_script: z.string().optional(),
  proposal_text: z.string().optional(),
})

export const bulkParseInputSchema = z.object({
  raw_text: z.string().min(1),
  saved_search_id: z.string().uuid(),
})

export const deepVetInputSchema = z.object({
  jobs: z.array(
    z.object({
      id: z.string().uuid(),
      title: z.string(),
      budget_display: z.string().nullable().optional(),
      ai_score: z.number().nullable().optional(),
      client_location: z.string().nullable().optional(),
      client_spend: z.string().nullable().optional(),
      client_rating: z.string().nullable().optional(),
      full_description: z.string().min(1),
      upwork_link: z.string().optional(),
    })
  ),
})

export const generatePromptInputSchema = z.object({
  job_id: z.string().uuid(),
})
