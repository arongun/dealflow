import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { callClaude } from '@/lib/ai/claude'
import { CLAUDE_CODE_PROMPT_SYSTEM, buildClaudeCodePromptUserMessage } from '@/lib/ai/prompts'
import { generatePromptInputSchema } from '@/lib/schemas'

export async function POST(request: NextRequest) {
  const supabase = createServerClient()
  const body = await request.json()

  const parsed = generatePromptInputSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: parsed.error.issues },
      { status: 400 }
    )
  }

  const { data: job, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('id', parsed.data.job_id)
    .single()

  if (error || !job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  try {
    // Generate token and password
    const token = `rd_${Math.random().toString(36).slice(2, 10)}`
    const password = Math.random().toString(36).slice(2, 10)

    // Ask Claude to generate the slug from the job title/description
    const slugRaw = await callClaude(
      'Extract a SHORT customer-facing slug (2-3 words max, lowercase, hyphens) from this job. If you can identify the company/client name, use that (e.g. "zemobile", "acme-realty"). If no company name, use a short concept slug (e.g. "saas-dashboard", "ai-chatbot", "hotel-booking"). Output ONLY the slug, nothing else.',
      `Job title: ${job.title}\nDescription: ${(job.full_description || job.description_snippet || '').slice(0, 500)}`,
      { maxTokens: 50 }
    )
    const slug = slugRaw
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 30) || 'demo'

    // Generate the full Claude Code prompt
    const userMessage = buildClaudeCodePromptUserMessage({
      title: job.title,
      full_description: job.full_description,
      deep_vet_approach: job.deep_vet_approach,
      slug,
      token,
      password,
    })

    const prompt = await callClaude(CLAUDE_CODE_PROMPT_SYSTEM, userMessage, { maxTokens: 2048 })

    // Save to job
    await supabase
      .from('jobs')
      .update({
        claude_code_prompt: prompt,
        demo_token: token,
        demo_password: password,
      })
      .eq('id', job.id)

    await supabase.from('job_history').insert({
      job_id: job.id,
      action: 'generate_prompt',
      details: 'Claude Code prompt generated',
    })

    return NextResponse.json({ prompt, token, password })
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Failed to generate prompt: ' + (err.message || 'Unknown') },
      { status: 500 }
    )
  }
}
