import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = createServerClient()

  // Total jobs
  const { count: totalJobs } = await supabase
    .from('jobs')
    .select('*', { count: 'exact', head: true })

  // Jobs this week
  const weekAgo = new Date()
  weekAgo.setDate(weekAgo.getDate() - 7)
  const { count: jobsThisWeek } = await supabase
    .from('jobs')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', weekAgo.toISOString())

  // GO count for rate calc
  const { count: goCount } = await supabase
    .from('jobs')
    .select('*', { count: 'exact', head: true })
    .eq('ai_verdict', 'GO')

  const goRate = totalJobs && totalJobs > 0
    ? Math.round(((goCount ?? 0) / totalJobs) * 100)
    : 0

  // Active pipeline (not closed/lost/rejected/new)
  const { count: activePipeline } = await supabase
    .from('jobs')
    .select('*', { count: 'exact', head: true })
    .in('pipeline_stage', ['go', 'building', 'ready', 'applied', 'replied'])

  // Proposals sent
  const { count: proposalsSent } = await supabase
    .from('jobs')
    .select('*', { count: 'exact', head: true })
    .in('pipeline_stage', ['applied', 'replied', 'won', 'lost'])

  // Clients signed
  const { count: clientsSigned } = await supabase
    .from('jobs')
    .select('*', { count: 'exact', head: true })
    .eq('pipeline_stage', 'won')

  // Best performing saved search by GO rate
  const { data: searches } = await supabase
    .from('saved_searches')
    .select('name, total_jobs_found, total_go')
    .gt('total_jobs_found', 0)
    .order('total_go', { ascending: false })
    .limit(1)

  let bestSearch = null
  if (searches && searches.length > 0) {
    const s = searches[0]
    bestSearch = {
      name: s.name,
      go_rate: Math.round((s.total_go / s.total_jobs_found) * 100),
    }
  }

  // Recent activity
  const { data: recentActivity } = await supabase
    .from('job_history')
    .select('*, jobs!inner(title)')
    .order('created_at', { ascending: false })
    .limit(10)

  return NextResponse.json({
    total_jobs: totalJobs ?? 0,
    jobs_this_week: jobsThisWeek ?? 0,
    go_rate: goRate,
    active_pipeline: activePipeline ?? 0,
    proposals_sent: proposalsSent ?? 0,
    clients_signed: clientsSigned ?? 0,
    best_search: bestSearch,
    recent_activity: (recentActivity ?? []).map((a: any) => ({
      ...a,
      job_title: a.jobs?.title,
      jobs: undefined,
    })),
  })
}
