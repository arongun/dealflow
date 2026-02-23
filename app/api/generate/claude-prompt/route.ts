import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { generatePromptInputSchema } from '@/lib/schemas'
import { buildClaudeCodePromptMessage } from '@/lib/ai/prompts'

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

  const prompt = buildClaudeCodePromptMessage({
    title: job.title,
    full_description: job.full_description,
    deep_vet_approach: job.deep_vet_approach,
  })

  // Extract token and password from the generated prompt
  const tokenMatch = prompt.match(/Token: (rd_\w+)/)
  const passwordMatch = prompt.match(/Password: (\w+)/)
  const token = tokenMatch?.[1] ?? ''
  const password = passwordMatch?.[1] ?? ''

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
}
