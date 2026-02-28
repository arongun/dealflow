import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { callClaude } from '@/lib/ai/claude'
import { LOOM_SCRIPT_SYSTEM, buildLoomScriptMessage } from '@/lib/ai/prompts'
import { generatePromptInputSchema } from '@/lib/schemas'

export const maxDuration = 120

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
    const message = buildLoomScriptMessage({
      title: job.title,
      full_description: job.full_description,
      demo_url: job.demo_url,
      deep_vet_approach: job.deep_vet_approach,
    })

    const script = await callClaude(LOOM_SCRIPT_SYSTEM, message)

    await supabase
      .from('jobs')
      .update({ loom_script: script })
      .eq('id', job.id)

    await supabase.from('job_history').insert({
      job_id: job.id,
      action: 'generate_loom_script',
      details: 'Loom script generated',
    })

    return NextResponse.json({ script })
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Failed to generate script: ' + (err.message || 'Unknown') },
      { status: 500 }
    )
  }
}
