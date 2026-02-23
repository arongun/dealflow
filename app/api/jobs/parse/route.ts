import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { callClaude, extractJSON } from '@/lib/ai/claude'
import { BULK_PARSE_SYSTEM } from '@/lib/ai/prompts'
import { bulkParseInputSchema, parseResultSchema, parsedJobSchema } from '@/lib/schemas'
import { generateDedupHash } from '@/lib/dedup'

export async function POST(request: NextRequest) {
  const supabase = createServerClient()
  const body = await request.json()

  const parsed = bulkParseInputSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: parsed.error.issues },
      { status: 400 }
    )
  }

  const { raw_text, saved_search_id } = parsed.data
  const startTime = Date.now()

  try {
    // Call Claude to parse the raw text
    const raw = await callClaude(
      BULK_PARSE_SYSTEM,
      raw_text,
      { maxTokens: 8192 }
    )

    const jsonStr = extractJSON(raw)
    let aiJobs: any[] = []
    let totalFound = 0

    try {
      const jsonParsed = JSON.parse(jsonStr)
      const result = parseResultSchema.safeParse(jsonParsed)

      if (result.success) {
        aiJobs = result.data.jobs
        totalFound = result.data.total_found
      } else {
        // Salvage individual items
        if (jsonParsed.jobs && Array.isArray(jsonParsed.jobs)) {
          for (const job of jsonParsed.jobs) {
            const itemResult = parsedJobSchema.safeParse(job)
            if (itemResult.success) aiJobs.push(itemResult.data)
          }
          totalFound = jsonParsed.total_found ?? aiJobs.length
        }
      }
    } catch {
      return NextResponse.json(
        { error: 'Failed to parse AI response' },
        { status: 500 }
      )
    }

    if (aiJobs.length === 0) {
      return NextResponse.json(
        { error: 'No jobs could be parsed from the text' },
        { status: 400 }
      )
    }

    // Get existing block list hashes for dedup
    const { data: blockList } = await supabase
      .from('block_list')
      .select('dedup_hash')

    const blockedHashes = new Set(
      (blockList ?? []).map((b: any) => b.dedup_hash).filter(Boolean)
    )

    const goJobs: any[] = []
    const noGoJobs: any[] = []
    const reviewJobs: any[] = []
    let blockedCount = 0

    for (const job of aiJobs) {
      const hash = generateDedupHash(job.title, job.description_snippet)

      // Check dedup
      if (blockedHashes.has(hash)) {
        blockedCount++
        continue
      }

      const jobRecord = {
        title: job.title,
        description_snippet: job.description_snippet,
        budget_display: job.budget_display,
        budget_type: job.budget_type,
        client_location: job.client_location,
        client_spend: job.client_spend,
        client_rating: job.client_rating,
        proposals_count: job.proposals_count,
        skills: job.skills,
        posted_at: job.posted_at,
        ai_score: job.ai_score,
        ai_verdict: job.ai_verdict,
        ai_reasoning: job.ai_reasoning,
        dedup_hash: hash,
        saved_search_id,
        pipeline_stage: job.ai_verdict === 'NO-GO' ? 'rejected' : 'new',
      }

      if (job.ai_verdict === 'NO-GO') {
        noGoJobs.push(jobRecord)
      } else if (job.ai_verdict === 'NEEDS_REVIEW') {
        reviewJobs.push(jobRecord)
      } else {
        goJobs.push(jobRecord)
      }
    }

    // Insert GO and NEEDS_REVIEW jobs
    const jobsToInsert = [...goJobs, ...reviewJobs]
    let insertedJobs: any[] = []

    if (jobsToInsert.length > 0) {
      const { data: inserted, error: insertError } = await supabase
        .from('jobs')
        .insert(jobsToInsert)
        .select()

      if (insertError) {
        return NextResponse.json(
          { error: 'Failed to save jobs: ' + insertError.message },
          { status: 500 }
        )
      }
      insertedJobs = inserted ?? []
    }

    // Add NO-GO jobs to block list
    if (noGoJobs.length > 0) {
      const blockEntries = noGoJobs.map((j) => ({
        title: j.title,
        description_snippet: j.description_snippet,
        dedup_hash: j.dedup_hash,
        reason: j.ai_reasoning,
        source_saved_search_id: saved_search_id,
      }))

      await supabase.from('block_list').insert(blockEntries)

      // Also insert NO-GO jobs into jobs table for tracking
      await supabase.from('jobs').insert(noGoJobs)
    }

    // Update saved search stats
    const { data: currentSearch } = await supabase
      .from('saved_searches')
      .select('total_jobs_found, total_go, total_no_go')
      .eq('id', saved_search_id)
      .single()

    if (currentSearch) {
      await supabase
        .from('saved_searches')
        .update({
          total_jobs_found: (currentSearch.total_jobs_found ?? 0) + aiJobs.length,
          total_go: (currentSearch.total_go ?? 0) + goJobs.length,
          total_no_go: (currentSearch.total_no_go ?? 0) + noGoJobs.length,
        })
        .eq('id', saved_search_id)
    }

    // Save run history
    const duration = Date.now() - startTime
    await supabase.from('run_history').insert({
      saved_search_id,
      saved_search_name: null,
      total_pasted: totalFound,
      total_parsed: aiJobs.length,
      total_go: goJobs.length,
      total_no_go: noGoJobs.length,
      total_review: reviewJobs.length,
      total_blocked: blockedCount,
      duration_ms: duration,
    })

    return NextResponse.json({
      total_found: totalFound,
      total_parsed: aiJobs.length,
      total_go: goJobs.length,
      total_no_go: noGoJobs.length,
      total_review: reviewJobs.length,
      total_blocked: blockedCount,
      jobs: insertedJobs,
    })
  } catch (err: any) {
    return NextResponse.json(
      { error: 'AI analysis failed: ' + (err.message || 'Unknown error') },
      { status: 500 }
    )
  }
}
