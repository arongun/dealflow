import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { callClaude, extractJSON } from '@/lib/ai/claude'
import { DEEP_VET_SYSTEM, buildDeepVetUserMessage } from '@/lib/ai/prompts'
import { deepVetInputSchema, deepVetResultSchema } from '@/lib/schemas'

export async function POST(request: NextRequest) {
  const supabase = createServerClient()
  const body = await request.json()

  const parsed = deepVetInputSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: parsed.error.issues },
      { status: 400 }
    )
  }

  const results: any[] = []

  for (const job of parsed.data.jobs) {
    try {
      const userMessage = buildDeepVetUserMessage({
        title: job.title,
        budget_display: job.budget_display ?? null,
        ai_score: job.ai_score ?? null,
        client_location: job.client_location ?? null,
        client_spend: job.client_spend ?? null,
        client_rating: job.client_rating ?? null,
        full_description: job.full_description,
      })

      const raw = await callClaude(DEEP_VET_SYSTEM, userMessage)
      const jsonStr = extractJSON(raw)
      const jsonParsed = JSON.parse(jsonStr)
      const result = deepVetResultSchema.safeParse(jsonParsed)

      if (!result.success) {
        results.push({
          id: job.id,
          error: 'Failed to validate AI response',
        })
        continue
      }

      // Update the job in the database
      const updateData: any = {
        ...result.data,
        full_description: job.full_description,
      }

      if (job.upwork_link) {
        updateData.upwork_link = job.upwork_link
      }

      const { error: updateError } = await supabase
        .from('jobs')
        .update(updateData)
        .eq('id', job.id)

      if (updateError) {
        results.push({
          id: job.id,
          error: 'Failed to save: ' + updateError.message,
        })
        continue
      }

      // Log to history
      await supabase.from('job_history').insert({
        job_id: job.id,
        action: 'deep_vet',
        new_value: result.data.deep_vet_verdict,
        details: `Deep vet completed. Score: ${result.data.deep_vet_score}/10, Verdict: ${result.data.deep_vet_verdict}`,
      })

      results.push({
        id: job.id,
        ...result.data,
      })
    } catch (err: any) {
      results.push({
        id: job.id,
        error: err.message || 'Unknown error',
      })
    }
  }

  return NextResponse.json({ results })
}
