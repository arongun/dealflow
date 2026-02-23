'use client'

import { useState, useEffect, useCallback } from 'react'
import { useToast } from '../components/toast'
import { CopyButton } from '../components/copy-button'

// ── Types ──────────────────────────────────────────────────────

interface SavedSearch {
  id: string
  name: string
  url: string
  platform: string
}

interface DailyRunJob {
  id: string
  title: string
  description_snippet: string
  budget_display: string | null
  budget_type: string | null
  client_location: string | null
  client_spend: string | null
  client_rating: number | null
  proposals_count: number | null
  skills: string[] | null
  posted_at: string | null
  ai_score: number
  ai_verdict: 'GO' | 'NO-GO' | 'NEEDS_REVIEW'
  ai_reasoning: string
  saved_search_id: string | null
  pipeline_stage: string
  upwork_link: string | null
  full_description: string | null
  verdict_override: string | null
  // Deep vet fields
  deep_vet_score: number | null
  deep_vet_verdict: string | null
  deep_vet_reasoning: string | null
  deep_vet_approach: string | null
  deep_vet_risks: string | null
  deep_vet_opportunities: string | null
  ai_estimated_effort: string | null
  // Generated content
  claude_code_prompt: string | null
  loom_script: string | null
  proposal_text: string | null
  demo_token: string | null
  demo_password: string | null
}

interface ParseResponse {
  total_found: number
  total_parsed: number
  total_go: number
  total_no_go: number
  total_review: number
  total_blocked: number
  jobs: DailyRunJob[]
}

interface GeneratedContent {
  prompt?: string
  script?: string
  proposal?: string
  token?: string
  password?: string
}

type Phase = 'input' | 'parsed' | 'deep-vetted'
type JobStatus = 'active' | 'skipped' | 'rejected' | 'waiting' | 'went-go'

const VERDICT_OPTIONS = ['GO', 'NEEDS_REVIEW', 'NO-GO'] as const

// ── Helpers ────────────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 7) return 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20'
  if (score >= 4) return 'text-amber-400 bg-amber-500/10 border border-amber-500/20'
  return 'text-red-400 bg-red-500/10 border border-red-500/20'
}

function verdictDot(verdict: string): string {
  if (verdict === 'GO') return 'bg-emerald-400'
  if (verdict === 'NEEDS_REVIEW') return 'bg-amber-400'
  return 'bg-red-400'
}

function verdictTextColor(verdict: string): string {
  if (verdict === 'GO') return 'text-emerald-400'
  if (verdict === 'NEEDS_REVIEW') return 'text-amber-400'
  return 'text-red-400'
}

function verdictLabel(verdict: string): string {
  if (verdict === 'GO') return 'Go'
  if (verdict === 'NEEDS_REVIEW') return 'Review'
  return 'No-Go'
}

function verdictBadgeBg(verdict: string): string {
  if (verdict === 'GO') return 'bg-emerald-500/10'
  if (verdict === 'NEEDS_REVIEW') return 'bg-amber-500/10'
  return 'bg-red-500/10'
}

// ── Main Component ─────────────────────────────────────────────

export default function DailyRunPage() {
  const { toast } = useToast()

  // Phase 1 state
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([])
  const [selectedSearchId, setSelectedSearchId] = useState<string>('')
  const [rawText, setRawText] = useState('')
  const [phase, setPhase] = useState<Phase>('input')
  const [parseLoading, setParseLoading] = useState(false)
  const [parseSummary, setParseSummary] = useState<ParseResponse | null>(null)
  const [jobs, setJobs] = useState<DailyRunJob[]>([])
  const [initialLoadDone, setInitialLoadDone] = useState(false)

  // Phase 2 state
  const [deepVetLoading, setDeepVetLoading] = useState(false)
  const [generatedContent, setGeneratedContent] = useState<Record<string, GeneratedContent>>({})
  const [generatingJobs, setGeneratingJobs] = useState<Record<string, boolean>>({})

  // Per-job input state (local edits before save)
  const [upworkLinks, setUpworkLinks] = useState<Record<string, string>>({})
  const [fullDescriptions, setFullDescriptions] = useState<Record<string, string>>({})

  // Per-job status state
  const [jobStatuses, setJobStatuses] = useState<Record<string, JobStatus>>({})

  // Notes modal state (for skip & reject)
  const [noteModal, setNoteModal] = useState<{
    jobId: string
    action: 'skip' | 'reject'
    notes: string
  } | null>(null)

  // Verdict override dropdown
  const [showVerdictDropdown, setShowVerdictDropdown] = useState<string | null>(null)

  // ── Load saved searches on mount ─────────────────────────────

  useEffect(() => {
    async function loadSearches() {
      try {
        const res = await fetch('/api/saved-searches')
        if (res.ok) {
          const data = await res.json()
          setSavedSearches(data)
          if (data.length > 0) setSelectedSearchId(data[0].id)
        }
      } catch {
        toast('Failed to load saved searches', 'error')
      }
    }
    loadSearches()
  }, [toast])

  // ── Load persisted "new" jobs from DB on mount ───────────────

  useEffect(() => {
    async function loadExistingJobs() {
      try {
        const res = await fetch('/api/jobs?pipeline_stage=new')
        if (!res.ok) return
        const data: DailyRunJob[] = await res.json()

        if (data.length > 0) {
          // Sort by ai_score descending
          const sorted = data.sort((a, b) => (b.ai_score ?? 0) - (a.ai_score ?? 0))
          setJobs(sorted)

          // Initialize statuses
          const statuses: Record<string, JobStatus> = {}
          const links: Record<string, string> = {}
          const descs: Record<string, string> = {}

          sorted.forEach((j) => {
            statuses[j.id] = 'active'
            if (j.upwork_link) links[j.id] = j.upwork_link
            if (j.full_description) descs[j.id] = j.full_description
          })

          setJobStatuses(statuses)
          setUpworkLinks(links)
          setFullDescriptions(descs)

          // Determine phase based on data
          const hasDeepVet = sorted.some((j) => j.deep_vet_score !== null)
          if (hasDeepVet) {
            setPhase('deep-vetted')
          } else {
            setPhase('parsed')
          }
        }
      } catch {
        // Silent fail — just show empty input phase
      } finally {
        setInitialLoadDone(true)
      }
    }
    loadExistingJobs()
  }, [])

  // ── Phase 1: Parse ──────────────────────────────────────────

  const handleParse = useCallback(async () => {
    if (!rawText.trim()) {
      toast('Paste some job results first', 'error')
      return
    }
    if (!selectedSearchId) {
      toast('Select a saved search first', 'error')
      return
    }

    setParseLoading(true)
    try {
      const res = await fetch('/api/jobs/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          raw_text: rawText,
          saved_search_id: selectedSearchId,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Parse failed')
      }

      const data: ParseResponse = await res.json()
      setParseSummary(data)

      // Only show GO and NEEDS_REVIEW jobs, sorted by ai_score descending
      const displayJobs = data.jobs
        .filter((j) => j.ai_verdict === 'GO' || j.ai_verdict === 'NEEDS_REVIEW')
        .sort((a, b) => b.ai_score - a.ai_score)

      // Merge with any existing jobs (don't lose them)
      setJobs((prev) => {
        const existingIds = new Set(prev.map((j) => j.id))
        const newJobs = displayJobs.filter((j) => !existingIds.has(j.id))
        return [...prev, ...newJobs].sort((a, b) => (b.ai_score ?? 0) - (a.ai_score ?? 0))
      })

      // Initialize statuses for new jobs only
      setJobStatuses((prev) => {
        const next = { ...prev }
        displayJobs.forEach((j) => {
          if (!next[j.id]) next[j.id] = 'active'
        })
        return next
      })

      setPhase('parsed')
      toast(`Analysis complete: ${data.total_go} GO, ${data.total_review} to review`, 'success')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to analyze jobs'
      toast(message, 'error')
    } finally {
      setParseLoading(false)
    }
  }, [rawText, selectedSearchId, toast])

  // ── Phase 2: Deep Vet ───────────────────────────────────────

  const handleDeepVet = useCallback(async () => {
    // Only deep vet jobs that have content AND are active
    const jobsToVet = jobs.filter(
      (j) =>
        fullDescriptions[j.id]?.trim() &&
        jobStatuses[j.id] !== 'skipped' &&
        jobStatuses[j.id] !== 'rejected' &&
        jobStatuses[j.id] !== 'went-go' &&
        jobStatuses[j.id] !== 'waiting'
    )

    // Auto-skip jobs without content
    const jobsWithoutContent = jobs.filter(
      (j) =>
        !fullDescriptions[j.id]?.trim() &&
        jobStatuses[j.id] === 'active'
    )

    if (jobsWithoutContent.length > 0) {
      // Mark them as skipped with a note
      for (const j of jobsWithoutContent) {
        try {
          await fetch(`/api/jobs/${j.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              pipeline_stage: 'rejected',
              rejection_reason: 'Auto-skipped: no full description provided',
              notes: 'Auto-skipped during deep analysis — missing full job description',
            }),
          })
        } catch { /* silent */ }
      }
      setJobStatuses((prev) => {
        const next = { ...prev }
        jobsWithoutContent.forEach((j) => {
          next[j.id] = 'skipped'
        })
        return next
      })
      toast(`${jobsWithoutContent.length} job(s) auto-skipped (no description)`, 'info')
    }

    if (jobsToVet.length === 0) {
      toast('Fill in at least one full job description', 'error')
      return
    }

    // Save upwork links and descriptions to DB first
    for (const j of jobsToVet) {
      const updates: Record<string, string> = {}
      if (upworkLinks[j.id]) updates.upwork_link = upworkLinks[j.id]
      if (fullDescriptions[j.id]) updates.full_description = fullDescriptions[j.id]
      if (Object.keys(updates).length > 0) {
        await fetch(`/api/jobs/${j.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        })
      }
    }

    setDeepVetLoading(true)
    try {
      const res = await fetch('/api/jobs/deep-vet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobs: jobsToVet.map((j) => ({
            id: j.id,
            title: j.title,
            budget_display: j.budget_display,
            ai_score: j.ai_score,
            client_location: j.client_location,
            client_spend: j.client_spend,
            client_rating: j.client_rating,
            full_description: fullDescriptions[j.id],
            upwork_link: upworkLinks[j.id] || undefined,
          })),
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Deep vet failed')
      }

      const data = await res.json()

      // Update jobs with deep vet results
      setJobs((prev) =>
        prev.map((j) => {
          const result = data.results?.find((r: { id: string }) => r.id === j.id)
          if (result && !result.error) {
            return {
              ...j,
              deep_vet_score: result.deep_vet_score ?? null,
              deep_vet_verdict: result.deep_vet_verdict ?? null,
              deep_vet_reasoning: result.deep_vet_reasoning ?? null,
              deep_vet_approach: result.deep_vet_approach ?? null,
              deep_vet_risks: result.deep_vet_risks ?? null,
              deep_vet_opportunities: result.deep_vet_opportunities ?? null,
              ai_estimated_effort: result.ai_estimated_effort ?? null,
            }
          }
          return j
        })
      )

      setPhase('deep-vetted')
      toast('Deep analysis complete', 'success')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Deep vet failed'
      toast(message, 'error')
    } finally {
      setDeepVetLoading(false)
    }
  }, [jobs, fullDescriptions, upworkLinks, jobStatuses, toast])

  // ── Actions ─────────────────────────────────────────────────

  const handleGo = useCallback(
    async (job: DailyRunJob, buildType: 'build' | 'loom_only') => {
      setGeneratingJobs((prev) => ({ ...prev, [job.id]: true }))

      try {
        // Update pipeline stage
        await fetch(`/api/jobs/${job.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pipeline_stage: 'go',
            build_type: buildType,
          }),
        })

        const content: GeneratedContent = {}

        // Generate Claude prompt (only for build type)
        if (buildType === 'build') {
          const promptRes = await fetch('/api/generate/claude-prompt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ job_id: job.id }),
          })
          if (promptRes.ok) {
            const promptData = await promptRes.json()
            content.prompt = promptData.prompt
            content.token = promptData.token
            content.password = promptData.password
          }
        }

        // Generate Loom script
        const scriptRes = await fetch('/api/generate/loom-script', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ job_id: job.id }),
        })
        if (scriptRes.ok) {
          const scriptData = await scriptRes.json()
          content.script = scriptData.script
        }

        // Generate proposal
        const proposalRes = await fetch('/api/generate/proposal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ job_id: job.id }),
        })
        if (proposalRes.ok) {
          const proposalData = await proposalRes.json()
          content.proposal = proposalData.proposal
        }

        setGeneratedContent((prev) => ({ ...prev, [job.id]: content }))
        setJobStatuses((prev) => ({ ...prev, [job.id]: 'went-go' }))
        toast(
          buildType === 'build'
            ? 'Demo prompt, script & proposal generated'
            : 'Loom script & proposal generated',
          'success'
        )
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Generation failed'
        toast(message, 'error')
      } finally {
        setGeneratingJobs((prev) => ({ ...prev, [job.id]: false }))
      }
    },
    [toast]
  )

  const handleRejectConfirm = useCallback(
    async (jobId: string, notes: string) => {
      try {
        await fetch(`/api/jobs/${jobId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pipeline_stage: 'rejected',
            rejection_reason: notes.trim() || 'Rejected during daily run',
            notes: notes.trim() || undefined,
          }),
        })
        setJobStatuses((prev) => ({ ...prev, [jobId]: 'rejected' }))
        setNoteModal(null)
        toast('Job rejected', 'info')
      } catch {
        toast('Failed to reject job', 'error')
      }
    },
    [toast]
  )

  const handleSkipConfirm = useCallback(
    async (jobId: string, notes: string) => {
      try {
        await fetch(`/api/jobs/${jobId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pipeline_stage: 'rejected',
            rejection_reason: notes.trim() || 'Skipped during daily run',
            notes: notes.trim() || undefined,
          }),
        })
        setJobStatuses((prev) => ({ ...prev, [jobId]: 'skipped' }))
        setNoteModal(null)
        toast('Job skipped', 'info')
      } catch {
        toast('Failed to skip job', 'error')
      }
    },
    [toast]
  )

  const handleWait = useCallback(
    async (jobId: string) => {
      try {
        await fetch(`/api/jobs/${jobId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pipeline_stage: 'waiting' }),
        })
        setJobStatuses((prev) => ({ ...prev, [jobId]: 'waiting' }))
        toast('Job set to waiting', 'info')
      } catch {
        toast('Failed to update job', 'error')
      }
    },
    [toast]
  )

  const handleVerdictOverride = useCallback(
    async (jobId: string, newVerdict: string) => {
      try {
        await fetch(`/api/jobs/${jobId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ verdict_override: newVerdict }),
        })
        setJobs((prev) =>
          prev.map((j) => (j.id === jobId ? { ...j, verdict_override: newVerdict } : j))
        )
        setShowVerdictDropdown(null)
        toast(`Verdict overridden to ${verdictLabel(newVerdict)}`, 'success')
      } catch {
        toast('Failed to override verdict', 'error')
      }
    },
    [toast]
  )

  // ── Derived state ───────────────────────────────────────────

  const deepVetReady = jobs.some(
    (j) =>
      fullDescriptions[j.id]?.trim() &&
      jobStatuses[j.id] !== 'skipped' &&
      jobStatuses[j.id] !== 'rejected'
  )

  const activeJobs = jobs.filter(
    (j) => jobStatuses[j.id] !== 'skipped' && jobStatuses[j.id] !== 'rejected'
  )

  // ── Reset ───────────────────────────────────────────────────

  const handleReset = useCallback(() => {
    setPhase('input')
    setRawText('')
    setParseSummary(null)
    setJobs([])
    setDeepVetLoading(false)
    setGeneratedContent({})
    setGeneratingJobs({})
    setUpworkLinks({})
    setFullDescriptions({})
    setJobStatuses({})
    setNoteModal(null)
    setShowVerdictDropdown(null)
  }, [])

  // Don't render until initial load is done (avoids flash of input phase)
  if (!initialLoadDone) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-white" />
      </div>
    )
  }

  // ── Render ──────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Daily Run</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Paste Upwork results, analyze, deep vet, and generate outreach materials.
          </p>
        </div>
        {phase !== 'input' && (
          <button
            onClick={handleReset}
            className="rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm text-zinc-300 transition hover:bg-zinc-700 hover:text-white"
          >
            New Run
          </button>
        )}
      </div>

      {/* ─── Phase 1: Input ──────────────────────────────────── */}

      {phase === 'input' && (
        <div className="space-y-6">
          {/* Saved search selector */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-6">
            <label className="mb-2 block text-sm font-medium text-zinc-300">
              Saved Search
            </label>
            <select
              value={selectedSearchId}
              onChange={(e) => setSelectedSearchId(e.target.value)}
              className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-sm text-white outline-none transition focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600"
            >
              {savedSearches.length === 0 && (
                <option value="">No saved searches</option>
              )}
              {savedSearches.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} {s.platform ? `(${s.platform})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Textarea */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-6">
            <label className="mb-2 block text-sm font-medium text-zinc-300">
              Job Results
            </label>
            <textarea
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder="Paste your Upwork search results here..."
              className="min-h-[200px] w-full resize-y rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-white placeholder-zinc-500 outline-none transition focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600"
            />
            <div className="mt-3 flex items-center justify-between">
              <span className="text-xs text-zinc-500">
                {rawText.length > 0
                  ? `${rawText.length.toLocaleString()} characters`
                  : 'Paste the full search results page text'}
              </span>
              <button
                onClick={handleParse}
                disabled={parseLoading || !rawText.trim() || !selectedSearchId}
                className="rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-zinc-900 transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {parseLoading ? (
                  <span className="flex items-center gap-2">
                    <LoadingDots />
                    Analyzing jobs...
                  </span>
                ) : (
                  'Run Analysis'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Results Summary Bar ─────────────────────────────── */}

      {parseSummary && phase !== 'input' && (
        <div className="mb-6 rounded-lg border border-zinc-800 bg-zinc-900 px-5 py-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-zinc-300">
              Found <strong className="text-white">{parseSummary.total_found}</strong> jobs
            </span>
            <ChevronRight />
            <span className="text-zinc-400">
              {parseSummary.total_blocked} already blocked
            </span>
            <ChevronRight />
            <span className="text-zinc-300">
              <strong className="text-white">{parseSummary.total_parsed}</strong> analyzed
            </span>
            <ChevronRight />
            <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500/10 px-2 py-0.5 text-emerald-400">
              {parseSummary.total_go} GO
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-md bg-red-500/10 px-2 py-0.5 text-red-400">
              {parseSummary.total_no_go} NO-GO
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-500/10 px-2 py-0.5 text-amber-400">
              {parseSummary.total_review} NEEDS REVIEW
            </span>
          </div>
        </div>
      )}

      {/* ─── Persisted jobs indicator ─────────────────────────── */}

      {!parseSummary && phase !== 'input' && jobs.length > 0 && (
        <div className="mb-6 rounded-lg border border-zinc-800 bg-zinc-900 px-5 py-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-zinc-300">
              <strong className="text-white">{jobs.length}</strong> job(s) in progress from previous session
            </span>
            <span className="text-xs text-zinc-500">
              {activeJobs.length} active
            </span>
          </div>
        </div>
      )}

      {/* ─── Phase 2: Deep Vet Input ─────────────────────────── */}

      {(phase === 'parsed' || phase === 'deep-vetted') && (
        <div className="space-y-4">
          {/* Deep vet action bar */}
          {phase === 'parsed' && (
            <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900 px-5 py-4">
              <div>
                <h2 className="text-sm font-medium text-white">
                  Deep Vet — Fill in details for the jobs you want to analyze further
                </h2>
                <p className="mt-0.5 text-xs text-zinc-500">
                  Paste the full Upwork job description and link for each job, then run deep analysis. Jobs without content will be auto-skipped.
                </p>
              </div>
              <button
                onClick={handleDeepVet}
                disabled={deepVetLoading || !deepVetReady}
                className="shrink-0 rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-zinc-900 transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deepVetLoading ? (
                  <span className="flex items-center gap-2">
                    <LoadingDots />
                    Deep analyzing...
                  </span>
                ) : (
                  'Run Deep Analysis'
                )}
              </button>
            </div>
          )}

          {/* Job cards */}
          <div className="space-y-4">
            {activeJobs.map((job) => {
              const content = generatedContent[job.id]
              const isGenerating = generatingJobs[job.id]
              const status = jobStatuses[job.id]
              const hasDeepVet = job.deep_vet_score !== null

              // Determine the effective verdict (override takes priority)
              const originalVerdict = hasDeepVet ? (job.deep_vet_verdict ?? job.ai_verdict) : job.ai_verdict
              const effectiveVerdict = job.verdict_override ?? originalVerdict
              const hasOverride = job.verdict_override !== null && job.verdict_override !== originalVerdict
              const effectiveScore = hasDeepVet ? (job.deep_vet_score ?? job.ai_score) : job.ai_score

              return (
                <div
                  key={job.id}
                  className={`rounded-lg border bg-zinc-900 transition ${
                    status === 'waiting'
                      ? 'border-zinc-700'
                      : status === 'went-go'
                      ? 'border-emerald-500/30'
                      : 'border-zinc-800'
                  }`}
                >
                  <div className="p-5">
                    {/* Card header */}
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="truncate text-base font-medium text-white">
                            {job.title}
                          </h3>
                          <CopyButton text={job.title} />
                        </div>
                        {job.budget_display && (
                          <p className="mt-1 text-sm text-zinc-400">
                            {job.budget_display}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {/* AI score badge */}
                        <span
                          className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${scoreColor(
                            effectiveScore
                          )}`}
                        >
                          {effectiveScore}/10
                        </span>

                        {/* Verdict badge with override display */}
                        <div className="relative">
                          <button
                            onClick={() =>
                              setShowVerdictDropdown(
                                showVerdictDropdown === job.id ? null : job.id
                              )
                            }
                            className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium transition hover:ring-1 hover:ring-zinc-600 ${verdictBadgeBg(effectiveVerdict)} ${verdictTextColor(effectiveVerdict)}`}
                          >
                            {hasOverride ? (
                              <>
                                {/* Old verdict crossed out */}
                                <span className="flex items-center gap-1 opacity-50">
                                  <span className={`inline-block h-1.5 w-1.5 rounded-full ${verdictDot(originalVerdict)}`} />
                                  <span className="line-through">{verdictLabel(originalVerdict)}</span>
                                </span>
                                <span className="text-zinc-500">→</span>
                                {/* New override verdict */}
                                <span className="flex items-center gap-1">
                                  <span className={`inline-block h-1.5 w-1.5 rounded-full ${verdictDot(effectiveVerdict)}`} />
                                  <span>{verdictLabel(effectiveVerdict)}</span>
                                </span>
                              </>
                            ) : (
                              <>
                                <span className={`inline-block h-1.5 w-1.5 rounded-full ${verdictDot(effectiveVerdict)}`} />
                                {verdictLabel(effectiveVerdict)}
                              </>
                            )}
                          </button>

                          {/* Verdict dropdown */}
                          {showVerdictDropdown === job.id && (
                            <div className="absolute right-0 top-full z-20 mt-1 w-40 rounded-lg border border-zinc-700 bg-zinc-800 py-1 shadow-xl">
                              {VERDICT_OPTIONS.map((v) => (
                                <button
                                  key={v}
                                  onClick={() => handleVerdictOverride(job.id, v)}
                                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition hover:bg-zinc-700 ${
                                    effectiveVerdict === v ? 'bg-zinc-700/50' : ''
                                  }`}
                                >
                                  <span className={`inline-block h-2 w-2 rounded-full ${verdictDot(v)}`} />
                                  <span className={verdictTextColor(v)}>{verdictLabel(v)}</span>
                                  {effectiveVerdict === v && (
                                    <span className="ml-auto text-zinc-500">✓</span>
                                  )}
                                </button>
                              ))}
                              {hasOverride && (
                                <>
                                  <div className="my-1 border-t border-zinc-700" />
                                  <button
                                    onClick={() => handleVerdictOverride(job.id, originalVerdict)}
                                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-zinc-400 transition hover:bg-zinc-700"
                                  >
                                    Reset to AI verdict
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Status badges */}
                        {status === 'waiting' && (
                          <span className="inline-flex items-center rounded-md bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
                            Waiting
                          </span>
                        )}
                        {status === 'went-go' && (
                          <span className="inline-flex items-center rounded-md bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-400">
                            GO
                          </span>
                        )}
                      </div>
                    </div>

                    {/* AI reasoning */}
                    <p className="mt-3 text-sm text-zinc-400">
                      {hasDeepVet ? (job.deep_vet_reasoning ?? job.ai_reasoning) : job.ai_reasoning}
                    </p>

                    {/* Additional deep vet info */}
                    {hasDeepVet && (
                      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                        {job.deep_vet_approach && (
                          <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                            <p className="mb-1 text-xs font-medium text-zinc-500">Approach</p>
                            <p className="text-sm text-zinc-300">{job.deep_vet_approach}</p>
                          </div>
                        )}
                        {job.deep_vet_risks && (
                          <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                            <p className="mb-1 text-xs font-medium text-zinc-500">Risks</p>
                            <p className="text-sm text-zinc-300">{job.deep_vet_risks}</p>
                          </div>
                        )}
                        {job.deep_vet_opportunities && (
                          <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                            <p className="mb-1 text-xs font-medium text-zinc-500">Opportunities</p>
                            <p className="text-sm text-zinc-300">{job.deep_vet_opportunities}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {job.ai_estimated_effort && (
                      <div className="mt-3">
                        <span className="inline-flex items-center gap-1.5 rounded-md bg-blue-500/10 px-2 py-0.5 text-xs text-blue-400">
                          Estimated effort: {job.ai_estimated_effort}
                        </span>
                      </div>
                    )}

                    {/* ─── Inputs (pre deep vet) ────────────────── */}

                    {phase === 'parsed' && status === 'active' && (
                      <div className="mt-4 space-y-3">
                        <div>
                          <label className="mb-1 block text-xs font-medium text-zinc-500">
                            Upwork Link
                          </label>
                          <input
                            type="text"
                            value={upworkLinks[job.id] || ''}
                            onChange={(e) =>
                              setUpworkLinks((prev) => ({
                                ...prev,
                                [job.id]: e.target.value,
                              }))
                            }
                            placeholder="https://www.upwork.com/jobs/~..."
                            className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none transition focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-zinc-500">
                            Full Job Description
                          </label>
                          <textarea
                            value={fullDescriptions[job.id] || ''}
                            onChange={(e) =>
                              setFullDescriptions((prev) => ({
                                ...prev,
                                [job.id]: e.target.value,
                              }))
                            }
                            placeholder="Paste the full job description from the Upwork listing..."
                            className="min-h-[120px] w-full resize-y rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none transition focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600"
                          />
                        </div>
                        <div className="flex justify-end gap-3">
                          <button
                            onClick={() =>
                              setNoteModal({ jobId: job.id, action: 'skip', notes: '' })
                            }
                            className="text-sm text-zinc-500 transition hover:text-zinc-300"
                          >
                            Skip
                          </button>
                          <button
                            onClick={() =>
                              setNoteModal({ jobId: job.id, action: 'reject', notes: '' })
                            }
                            className="text-sm text-red-400/70 transition hover:text-red-400"
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                    )}

                    {/* ─── Action buttons (post deep vet) ───────── */}

                    {phase === 'deep-vetted' &&
                      hasDeepVet &&
                      status === 'active' && (
                        <div className="mt-4 flex flex-wrap items-center gap-2">
                          <button
                            onClick={() => handleGo(job, 'build')}
                            disabled={isGenerating}
                            className="rounded-lg bg-emerald-500/20 px-3 py-2 text-sm font-medium text-emerald-400 transition hover:bg-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {isGenerating ? (
                              <span className="flex items-center gap-2">
                                <LoadingDots />
                                Generating...
                              </span>
                            ) : (
                              'GO — Build Demo'
                            )}
                          </button>
                          <button
                            onClick={() => handleGo(job, 'loom_only')}
                            disabled={isGenerating}
                            className="rounded-lg bg-blue-500/20 px-3 py-2 text-sm font-medium text-blue-400 transition hover:bg-blue-500/30 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            GO — Loom Only
                          </button>
                          <button
                            onClick={() =>
                              setNoteModal({ jobId: job.id, action: 'reject', notes: '' })
                            }
                            className="rounded-lg bg-red-500/20 px-3 py-2 text-sm font-medium text-red-400 transition hover:bg-red-500/30"
                          >
                            Reject
                          </button>
                          <button
                            onClick={() => handleWait(job.id)}
                            className="rounded-lg bg-zinc-800 px-3 py-2 text-sm text-zinc-400 transition hover:bg-zinc-700 hover:text-zinc-300"
                          >
                            Wait
                          </button>
                          <button
                            onClick={() =>
                              setNoteModal({ jobId: job.id, action: 'skip', notes: '' })
                            }
                            className="text-sm text-zinc-500 transition hover:text-zinc-300"
                          >
                            Skip
                          </button>
                        </div>
                      )}

                    {/* Show action buttons for active jobs without deep vet in deep-vetted phase */}
                    {phase === 'deep-vetted' &&
                      !hasDeepVet &&
                      status === 'active' && (
                        <div className="mt-4 flex flex-wrap items-center gap-2">
                          <span className="text-xs text-zinc-500 italic">No deep vet data</span>
                          <button
                            onClick={() =>
                              setNoteModal({ jobId: job.id, action: 'reject', notes: '' })
                            }
                            className="rounded-lg bg-red-500/20 px-3 py-2 text-sm font-medium text-red-400 transition hover:bg-red-500/30"
                          >
                            Reject
                          </button>
                          <button
                            onClick={() =>
                              setNoteModal({ jobId: job.id, action: 'skip', notes: '' })
                            }
                            className="text-sm text-zinc-500 transition hover:text-zinc-300"
                          >
                            Skip
                          </button>
                        </div>
                      )}

                    {/* ─── Generated content (post GO) ──────────── */}

                    {isGenerating && (
                      <div className="mt-4 flex items-center gap-2 text-sm text-zinc-400">
                        <LoadingDots />
                        <span>Generating outreach materials...</span>
                      </div>
                    )}

                    {content && !isGenerating && (
                      <div className="mt-5 space-y-4">
                        {content.prompt && (
                          <div>
                            <div className="mb-2 flex items-center justify-between">
                              <span className="text-xs font-medium text-zinc-500">
                                Claude Code Prompt
                              </span>
                              <CopyButton text={content.prompt} label="Copy" />
                            </div>
                            <pre className="max-h-[300px] overflow-auto rounded-lg bg-zinc-800 p-3 text-sm text-zinc-300">
                              <code>{content.prompt}</code>
                            </pre>
                          </div>
                        )}

                        {content.script && (
                          <div>
                            <div className="mb-2 flex items-center justify-between">
                              <span className="text-xs font-medium text-zinc-500">
                                Loom Script
                              </span>
                              <CopyButton text={content.script} label="Copy" />
                            </div>
                            <pre className="max-h-[300px] overflow-auto rounded-lg bg-zinc-800 p-3 text-sm text-zinc-300">
                              <code>{content.script}</code>
                            </pre>
                          </div>
                        )}

                        {content.proposal && (
                          <div>
                            <div className="mb-2 flex items-center justify-between">
                              <span className="text-xs font-medium text-zinc-500">
                                Proposal Text
                              </span>
                              <CopyButton text={content.proposal} label="Copy" />
                            </div>
                            <pre className="max-h-[300px] overflow-auto whitespace-pre-wrap rounded-lg bg-zinc-800 p-3 text-sm text-zinc-300">
                              <code>{content.proposal}</code>
                            </pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Empty state */}
          {activeJobs.length === 0 && jobs.length > 0 && (
            <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-5 py-12 text-center">
              <p className="text-sm text-zinc-400">
                All jobs have been processed. Click &quot;New Run&quot; to start over.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ─── Loading Overlay for Phase 1 ─────────────────────── */}

      {parseLoading && (
        <div className="mt-6 flex flex-col items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 px-5 py-16">
          <div className="mb-4 h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-white" />
          <p className="text-sm text-zinc-300">
            Analyzing jobs<LoadingDots />
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            This may take 15-30 seconds depending on the number of jobs.
          </p>
        </div>
      )}

      {/* ─── Notes Modal (for skip & reject) ─────────────────── */}

      {noteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl">
            <h3 className="text-base font-medium text-white">
              {noteModal.action === 'reject' ? 'Reject Job' : 'Skip Job'}
            </h3>
            <p className="mt-1 text-sm text-zinc-400">
              {noteModal.action === 'reject'
                ? 'Add a note explaining why this job was rejected. This helps improve future scoring.'
                : 'Add a note explaining why you\'re skipping this job. This helps improve future scoring.'}
            </p>
            <textarea
              autoFocus
              value={noteModal.notes}
              onChange={(e) =>
                setNoteModal({ ...noteModal, notes: e.target.value })
              }
              placeholder={
                noteModal.action === 'reject'
                  ? 'e.g. Budget too low, scope too vague, not in our niche...'
                  : 'e.g. Not enough info, will revisit later, client seems risky...'
              }
              className="mt-4 min-h-[100px] w-full resize-y rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none transition focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  if (noteModal.action === 'reject') {
                    handleRejectConfirm(noteModal.jobId, noteModal.notes)
                  } else {
                    handleSkipConfirm(noteModal.jobId, noteModal.notes)
                  }
                }
              }}
            />
            <div className="mt-4 flex items-center justify-between">
              <span className="text-xs text-zinc-500">⌘+Enter to confirm</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setNoteModal(null)}
                  className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-300 transition hover:bg-zinc-700"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (noteModal.action === 'reject') {
                      handleRejectConfirm(noteModal.jobId, noteModal.notes)
                    } else {
                      handleSkipConfirm(noteModal.jobId, noteModal.notes)
                    }
                  }}
                  className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                    noteModal.action === 'reject'
                      ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                      : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
                  }`}
                >
                  {noteModal.action === 'reject' ? 'Reject' : 'Skip'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Sub-components ───────────────────────────────────────────────

function LoadingDots() {
  return (
    <span className="inline-flex">
      <span className="animate-pulse">.</span>
      <span className="animate-pulse" style={{ animationDelay: '200ms' }}>.</span>
      <span className="animate-pulse" style={{ animationDelay: '400ms' }}>.</span>
    </span>
  )
}

function ChevronRight() {
  return (
    <svg
      className="h-3.5 w-3.5 text-zinc-600"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  )
}
