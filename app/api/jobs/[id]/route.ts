import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { jobUpdateSchema } from '@/lib/schemas'

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

  // Get current job for history tracking
  const { data: currentJob } = await supabase
    .from('jobs')
    .select('pipeline_stage')
    .eq('id', id)
    .single()

  const { data, error } = await supabase
    .from('jobs')
    .update(parsed.data)
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

  return NextResponse.json(data)
}
