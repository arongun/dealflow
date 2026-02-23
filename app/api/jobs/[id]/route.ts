import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { jobUpdateSchema } from '@/lib/schemas'

// Auto-compute verdict_override when pipeline stage changes
// Only fires for verdict-significant stages (go, rejected)
function computeAutoOverride(
  newStage: string,
  aiVerdict: string | null,
  deepVetVerdict: string | null
): string | null | undefined {
  if (newStage !== 'go' && newStage !== 'rejected') return undefined // don't touch

  const baseVerdict = deepVetVerdict ?? aiVerdict
  if (!baseVerdict) return undefined

  if (newStage === 'go') {
    // User approves — override only if AI disagreed
    return baseVerdict === 'GO' ? null : 'GO'
  }

  if (newStage === 'rejected') {
    // User rejects — override only if AI disagreed
    return baseVerdict === 'NO-GO' ? null : 'NO-GO'
  }

  return undefined
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createServerClient()

  const { data: job, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  const { data: history } = await supabase
    .from('job_history')
    .select('*')
    .eq('job_id', id)
    .order('created_at', { ascending: false })

  return NextResponse.json({ ...job, history: history ?? [] })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createServerClient()
  const body = await request.json()

  const parsed = jobUpdateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: parsed.error.issues },
      { status: 400 }
    )
  }

  // Get current job for history tracking + auto-override computation
  const { data: currentJob } = await supabase
    .from('jobs')
    .select('pipeline_stage, ai_verdict, deep_vet_verdict, verdict_override')
    .eq('id', id)
    .single()

  // Build update payload — may include auto-computed verdict_override
  const updateData: Record<string, unknown> = { ...parsed.data }

  if (
    parsed.data.pipeline_stage &&
    currentJob &&
    parsed.data.pipeline_stage !== currentJob.pipeline_stage
  ) {
    const autoOverride = computeAutoOverride(
      parsed.data.pipeline_stage,
      currentJob.ai_verdict,
      currentJob.deep_vet_verdict
    )
    // undefined = don't touch, null = clear override, string = set override
    if (autoOverride !== undefined && parsed.data.verdict_override === undefined) {
      // Only auto-compute if the client didn't explicitly send a verdict_override
      updateData.verdict_override = autoOverride
    }
  }

  const { data, error } = await supabase
    .from('jobs')
    .update(updateData)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Log stage changes to history
  if (parsed.data.pipeline_stage && currentJob?.pipeline_stage !== parsed.data.pipeline_stage) {
    await supabase.from('job_history').insert({
      job_id: id,
      action: 'stage_change',
      old_value: currentJob?.pipeline_stage,
      new_value: parsed.data.pipeline_stage,
      details: `Pipeline stage changed from ${currentJob?.pipeline_stage} to ${parsed.data.pipeline_stage}`,
    })
  }

  // Log verdict override changes (catches both manual and auto-computed)
  const finalOverride = updateData.verdict_override
  if (finalOverride !== undefined && finalOverride !== currentJob?.verdict_override) {
    const oldVerdict = currentJob?.verdict_override ?? currentJob?.ai_verdict ?? 'unknown'
    const wasAuto = parsed.data.verdict_override === undefined && finalOverride !== undefined
    await supabase.from('job_history').insert({
      job_id: id,
      action: 'verdict_override',
      old_value: oldVerdict,
      new_value: finalOverride as string | null,
      details: wasAuto
        ? `Verdict auto-adjusted to ${finalOverride ?? 'AI verdict'} (stage → ${parsed.data.pipeline_stage})`
        : `Verdict manually overridden from ${oldVerdict} to ${finalOverride}`,
    })
  }

  return NextResponse.json(data)
}
