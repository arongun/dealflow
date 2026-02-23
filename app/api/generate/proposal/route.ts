import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { callClaude } from '@/lib/ai/claude'
import { PROPOSAL_SYSTEM, buildProposalMessage } from '@/lib/ai/prompts'
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
    const message = buildProposalMessage({
      title: job.title,
      full_description: job.full_description,
      loom_link: job.loom_link,
      loom_duration: job.loom_duration,
    })

    const proposal = await callClaude(PROPOSAL_SYSTEM, message)

    await supabase
      .from('jobs')
      .update({ proposal_text: proposal })
      .eq('id', job.id)

    await supabase.from('job_history').insert({
      job_id: job.id,
      action: 'generate_proposal',
      details: 'Proposal text generated',
    })

    return NextResponse.json({ proposal })
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Failed to generate proposal: ' + (err.message || 'Unknown') },
      { status: 500 }
    )
  }
}
