import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = createServerClient()
  const params = request.nextUrl.searchParams

  // Special case: just return active pipeline count
  if (params.get('count_active') === 'true') {
    const { count } = await supabase
      .from('jobs')
      .select('*', { count: 'exact', head: true })
      .in('pipeline_stage', ['new', 'go', 'building', 'ready'])

    return NextResponse.json({ active_count: count ?? 0 })
  }

  let query = supabase
    .from('jobs')
    .select('*')
    .order('created_at', { ascending: false })

  const stage = params.get('pipeline_stage')
  if (stage) query = query.eq('pipeline_stage', stage)

  const verdict = params.get('ai_verdict')
  if (verdict) query = query.eq('ai_verdict', verdict)

  const searchId = params.get('saved_search_id')
  if (searchId) query = query.eq('saved_search_id', searchId)

  const limit = params.get('limit')
  if (limit) query = query.limit(parseInt(limit, 10))

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}
