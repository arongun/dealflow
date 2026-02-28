import { NextRequest } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { callClaude, extractJSON } from '@/lib/ai/claude'
import { BULK_PARSE_SYSTEM } from '@/lib/ai/prompts'
import { bulkParseInputSchema, parseResultSchema, parsedJobSchema } from '@/lib/schemas'
import { generateDedupHash, splitRawTextIntoChunks, extractChunkIdentity } from '@/lib/dedup'

export const maxDuration = 300

const BATCH_SIZE = 8

function resolveRelativeTime(relativeStr: string | null | undefined): string | null {
  if (!relativeStr) return null
  const s = relativeStr.trim().toLowerCase()
  const now = new Date()

  if (s.includes('just')) return now.toISOString()

  const agoMatch = s.match(/(\d+)\s*(second|minute|hour|day|week|month)s?\s*ago/)
  if (agoMatch) {
    const amount = parseInt(agoMatch[1], 10)
    const unit = agoMatch[2]
    const ms = {
      second: 1000,
      minute: 60 * 1000,
      hour: 60 * 60 * 1000,
      day: 24 * 60 * 60 * 1000,
      week: 7 * 24 * 60 * 60 * 1000,
      month: 30 * 24 * 60 * 60 * 1000,
    }[unit]
    if (ms) return new Date(now.getTime() - amount * ms).toISOString()
  }

  if (s === 'yesterday') {
    return new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
  }

  const singleMatch = s.match(/^an?\s+(second|minute|hour|day|week|month)\s+ago$/)
  if (singleMatch) {
    const unit = singleMatch[1]
    const ms = {
      second: 1000,
      minute: 60 * 1000,
      hour: 60 * 60 * 1000,
      day: 24 * 60 * 60 * 1000,
      week: 7 * 24 * 60 * 60 * 1000,
      month: 30 * 24 * 60 * 60 * 1000,
    }[unit]
    if (ms) return new Date(now.getTime() - ms).toISOString()
  }

  return relativeStr
}

export async function POST(request: NextRequest) {
  const supabase = createServerClient()
  const body = await request.json()

  const parsed = bulkParseInputSchema.safeParse(body)
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: 'Invalid input', details: parsed.error.issues }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const { raw_text, saved_search_id } = parsed.data
  const startTime = Date.now()

  // ── Pre-AI Dedup: split text into chunks and filter out known jobs ──
  const chunks = splitRawTextIntoChunks(raw_text)
  let totalPreFiltered = 0

  const [{ data: blockList }, { data: existingJobs }] = await Promise.all([
    supabase.from('block_list').select('dedup_hash'),
    supabase.from('jobs').select('dedup_hash'),
  ])

  const knownHashes = new Set<string>()
  for (const b of blockList ?? []) {
    if (b.dedup_hash) knownHashes.add(b.dedup_hash)
  }
  for (const j of existingJobs ?? []) {
    if (j.dedup_hash) knownHashes.add(j.dedup_hash)
  }

  const newChunks: string[] = []
  if (chunks.length > 0) {
    for (const chunk of chunks) {
      const identity = extractChunkIdentity(chunk)
      if (!identity) {
        newChunks.push(chunk)
        continue
      }
      const hash = generateDedupHash(identity.title, identity.descSnippet)
      if (knownHashes.has(hash)) {
        totalPreFiltered++
      } else {
        newChunks.push(chunk)
      }
    }

    // If all chunks are dupes, return early via SSE
    if (newChunks.length === 0) {
      const duration = Date.now() - startTime
      await supabase.from('run_history').insert({
        saved_search_id,
        saved_search_name: null,
        total_pasted: chunks.length,
        total_parsed: 0,
        total_go: 0,
        total_no_go: 0,
        total_review: 0,
        total_blocked: 0,
        total_pre_filtered: totalPreFiltered,
        duration_ms: duration,
      })

      const enc = new TextEncoder()
      const earlyStream = new ReadableStream({
        start(ctrl) {
          function emit(event: string, data: unknown) {
            ctrl.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
          }
          emit('summary', {
            total_found: chunks.length,
            total_parsed: 0,
            total_go: 0,
            total_no_go: 0,
            total_review: 0,
            total_blocked: 0,
            total_pre_filtered: totalPreFiltered,
          })
          emit('done', {})
          ctrl.close()
        },
      })

      return new Response(earlyStream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      })
    }
  }

  // ── If few enough chunks for a single call, use old behavior (non-streaming) ──
  const chunksToProcess = newChunks.length > 0 ? newChunks : [raw_text]

  // ── Group into batches ──
  const batches: string[][] = []
  for (let i = 0; i < chunksToProcess.length; i += BATCH_SIZE) {
    batches.push(chunksToProcess.slice(i, i + BATCH_SIZE))
  }

  // ── Stream results via SSE ──
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      function emit(event: string, data: unknown) {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }

      // Totals across all batches
      let totalParsed = 0
      let totalGo = 0
      let totalNoGo = 0
      let totalReview = 0
      let totalBlocked = 0

      for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
        const batchChunks = batches[batchIdx]
        const batchText = batchChunks.join('\n')

        try {
          const raw = await callClaude(
            BULK_PARSE_SYSTEM,
            batchText,
            { maxTokens: 4096 }
          )

          const jsonStr = extractJSON(raw)
          let aiJobs: any[] = []

          try {
            const jsonParsed = JSON.parse(jsonStr)
            const result = parseResultSchema.safeParse(jsonParsed)

            if (result.success) {
              aiJobs = result.data.jobs
            } else if (jsonParsed.jobs && Array.isArray(jsonParsed.jobs)) {
              for (const job of jsonParsed.jobs) {
                const itemResult = parsedJobSchema.safeParse(job)
                if (itemResult.success) aiJobs.push(itemResult.data)
              }
            }
          } catch (parseErr) {
            console.error(`[parse] Batch ${batchIdx + 1}/${batches.length} JSON parse failed:`, parseErr)
            emit('error', {
              batch: batchIdx + 1,
              totalBatches: batches.length,
              message: `Batch ${batchIdx + 1} failed to parse AI response`,
            })
            continue
          }

          if (aiJobs.length === 0) {
            emit('error', {
              batch: batchIdx + 1,
              totalBatches: batches.length,
              message: `Batch ${batchIdx + 1} returned no jobs`,
            })
            continue
          }

          // ── Post-AI Dedup + categorize ──
          const goJobs: any[] = []
          const noGoJobs: any[] = []
          const reviewJobs: any[] = []
          let batchBlocked = 0

          for (const job of aiJobs) {
            const hash = generateDedupHash(job.title, job.description_snippet)
            if (knownHashes.has(hash)) {
              batchBlocked++
              continue
            }
            // Add to known hashes so subsequent batches don't dupe
            knownHashes.add(hash)

            const jobRecord = {
              title: job.title,
              description_snippet: job.description_snippet,
              budget_display: job.budget_display,
              budget_type: job.budget_type,
              client_location: job.client_location,
              client_spend: job.client_spend,
              client_rating: job.client_rating,
              proposals_count: job.proposals_count,
              has_hire: job.has_hire ?? false,
              skills: job.skills,
              posted_at: resolveRelativeTime(job.posted_at),
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

          // Insert GO + NEEDS_REVIEW jobs
          let insertedJobs: any[] = []
          const jobsToInsert = [...goJobs, ...reviewJobs]
          if (jobsToInsert.length > 0) {
            const { data: inserted, error: insertError } = await supabase
              .from('jobs')
              .insert(jobsToInsert)
              .select()

            if (insertError) {
              console.error(`[parse] Batch ${batchIdx + 1} DB insert failed:`, insertError.message)
              emit('error', {
                batch: batchIdx + 1,
                totalBatches: batches.length,
                message: `Batch ${batchIdx + 1} failed to save: ${insertError.message}`,
              })
              continue
            }
            insertedJobs = inserted ?? []
          }

          // Add NO-GO jobs to block list + jobs table
          if (noGoJobs.length > 0) {
            const blockEntries = noGoJobs.map((j) => ({
              title: j.title,
              description_snippet: j.description_snippet,
              dedup_hash: j.dedup_hash,
              reason: j.ai_reasoning,
              source_saved_search_id: saved_search_id,
            }))
            await supabase.from('block_list').insert(blockEntries)
            await supabase.from('jobs').insert(noGoJobs)
          }

          totalParsed += aiJobs.length
          totalGo += goJobs.length
          totalNoGo += noGoJobs.length
          totalReview += reviewJobs.length
          totalBlocked += batchBlocked

          // Emit this batch's results
          emit('batch', {
            jobs: insertedJobs,
            batch: batchIdx + 1,
            totalBatches: batches.length,
            batchStats: {
              parsed: aiJobs.length,
              go: goJobs.length,
              no_go: noGoJobs.length,
              review: reviewJobs.length,
              blocked: batchBlocked,
            },
          })
        } catch (err: any) {
          console.error(`[parse] Batch ${batchIdx + 1}/${batches.length} Claude call failed:`, err.message || err)
          emit('error', {
            batch: batchIdx + 1,
            totalBatches: batches.length,
            message: `Batch ${batchIdx + 1} AI call failed: ${err.message || 'Unknown error'}`,
          })
        }
      }

      // ── Update saved search stats ──
      const { data: currentSearch } = await supabase
        .from('saved_searches')
        .select('total_jobs_found, total_go, total_no_go')
        .eq('id', saved_search_id)
        .single()

      if (currentSearch) {
        await supabase
          .from('saved_searches')
          .update({
            total_jobs_found: (currentSearch.total_jobs_found ?? 0) + totalParsed,
            total_go: (currentSearch.total_go ?? 0) + totalGo,
            total_no_go: (currentSearch.total_no_go ?? 0) + totalNoGo,
          })
          .eq('id', saved_search_id)
      }

      // ── Save run history ──
      const duration = Date.now() - startTime
      await supabase.from('run_history').insert({
        saved_search_id,
        saved_search_name: null,
        total_pasted: (chunks.length > 0 ? chunks.length : totalParsed) + totalPreFiltered,
        total_parsed: totalParsed,
        total_go: totalGo,
        total_no_go: totalNoGo,
        total_review: totalReview,
        total_blocked: totalBlocked,
        total_pre_filtered: totalPreFiltered,
        duration_ms: duration,
      })

      // ── Emit final summary ──
      emit('summary', {
        total_found: totalParsed + totalPreFiltered,
        total_parsed: totalParsed,
        total_go: totalGo,
        total_no_go: totalNoGo,
        total_review: totalReview,
        total_blocked: totalBlocked,
        total_pre_filtered: totalPreFiltered,
      })

      emit('done', {})
      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
