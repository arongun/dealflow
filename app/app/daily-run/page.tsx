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

interface ParsedJob {
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
}

interface ParseResponse {
  total_found: number
  total_parsed: number
  total_go: number
  total_no_go: number
  total_review: number
  total_blocked: number
  jobs: ParsedJob[]
}

interface DeepVetResult {
  id: string
  deep_vet_score?: number
  deep_vet_verdict?: string
  deep_vet_reasoning?: string
  deep_vet_approach?: string
  deep_vet_risks?: string
  deep_vet_opportunities?: string
  ai_estimated_effort?: string
  error?: string
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

// ── Helpers ────────────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 7) return 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20'
  if (score >= 4) return 'text-amber-400 bg-amber-500/10 border border-amber-500/20'
  return 'text-red-400 bg-red-500/10 border border-red-500/20'
}

function verdictBadge(verdict: string): string {
  if (verdict === 'GO') return 'text-emerald-400 bg-emerald-500/10'
  if (verdict === 'NEEDS_REVIEW') return 'text-amber-400 bg-amber-500/10'
  return 'text-red-400 bg-red-500/10'
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
  const [parsedJobs, setParsedJobs] = useState<ParsedJob[]>([])

  // Phase 2 state
  const [deepVetLoading, setDeepVetLoading] = useState(false)
  const [deepVetResults, setDeepVetResults] = useState<Record<string, DeepVetResult>>({})
  const [generatedContent, setGeneratedContent] = useState<Record<string, GeneratedContent>>({})
  const [generatingJobs, setGeneratingJobs] = useState<Record<string, boolean>>({})

  // Per-job input state
  const [upworkLinks, setUpworkLinks] = useState<Record<string, string>>({})
  const [fullDescriptions, setFullDescriptions] = useState<Record<string, string>>({})

  // Per-job status state
  const [jobStatuses, setJobStatuses] = useState<Record<string, JobStatus>>({})
  const [rejectionReasons, setRejectionReasons] = useState<Record<string, string>>({})
  const [showRejectInput, setShowRejectInput] = useState<Record<string, boolean>>({})

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
      setParsedJobs(displayJobs)

      // Initialize statuses
      const statuses: Record<string, JobStatus> = {}
      displayJobs.forEach((j) => {
        statuses[j.id] = 'active'
      })
      setJobStatuses(statuses)

      setPhase('parsed')
      toast(`Analysis complete: ${data.total_go} GO, ${data.total_review} to review`, 'success')
    } catch (err: any) {
      toast(err.message || 'Failed to analyze jobs', 'error')
    } finally {
      setParseLoading(false)
    }
  }, [rawText, selectedSearchId, toast])

  // ── Phase 2: Deep Vet ───────────────────────────────────────

  const handleDeepVet = useCallback(async () => {
    const jobsToVet = parsedJobs.filter(
      (j) =>
        fullDescriptions[j.id]?.trim() &&
        jobStatuses[j.id] !== 'skipped' &&
        jobStatuses[j.id] !== 'rejected'
    )

    if (jobsToVet.length === 0) {
      toast('Fill in at least one full job description', 'error')
      return
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
      const resultsMap: Record<string, DeepVetResult> = {}
      for (const r of data.results) {
        resultsMap[r.id] = r
      }
      setDeepVetResults(resultsMap)
      setPhase('deep-vetted')
      toast('Deep analysis complete', 'success')
    } catch (err: any) {
      toast(err.message || 'Deep vet failed', 'error')
    } finally {
      setDeepVetLoading(false)
    }
  }, [parsedJobs, fullDescriptions, upworkLinks, jobStatuses, toast])

  // ── Actions ─────────────────────────────────────────────────

  const handleGo = useCallback(
    async (job: ParsedJob, buildType: 'build' | 'loom_only') => {
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
      } catch (err: any) {
        toast(err.message || 'Generation failed', 'error')
      } finally {
        setGeneratingJobs((prev) => ({ ...prev, [job.id]: false }))
      }
    },
    [toast]
  )

  const handleReject = useCallback(
    async (jobId: string) => {
      const reason = rejectionReasons[jobId]?.trim()
      try {
        await fetch(`/api/jobs/${jobId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pipeline_stage: 'rejected',
            rejection_reason: reason || 'Rejected during daily run',
          }),
        })
        setJobStatuses((prev) => ({ ...prev, [jobId]: 'rejected' }))
        setShowRejectInput((prev) => ({ ...prev, [jobId]: false }))
        toast('Job rejected', 'info')
      } catch {
        toast('Failed to reject job', 'error')
      }
    },
    [rejectionReasons, toast]
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

  const handleSkip = useCallback((jobId: string) => {
    setJobStatuses((prev) => ({ ...prev, [jobId]: 'skipped' }))
  }, [])

  // ── Derived state ───────────────────────────────────────────

  const deepVetReady = parsedJobs.some(
    (j) =>
      fullDescriptions[j.id]?.trim() &&
      jobStatuses[j.id] !== 'skipped' &&
      jobStatuses[j.id] !== 'rejected'
  )

  const activeJobs = parsedJobs.filter(
    (j) => jobStatuses[j.id] !== 'skipped'
  )

  // ── Reset ───────────────────────────────────────────────────

  const handleReset = useCallback(() => {
    setPhase('input')
    setRawText('')
    setParseSummary(null)
    setParsedJobs([])
    setDeepVetResults({})
    setGeneratedContent({})
    setGeneratingJobs({})
    setUpworkLinks({})
    setFullDescriptions({})
    setJobStatuses({})
    setRejectionReasons({})
    setShowRejectInput({})
  }, [])

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
                  Paste the full Upwork job description and link for each job, then run deep analysis.
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
              const dvResult = deepVetResults[job.id]
              const content = generatedContent[job.id]
              const isGenerating = generatingJobs[job.id]
              const status = jobStatuses[job.id]

              return (
                <div
                  key={job.id}
                  className={`rounded-lg border bg-zinc-900 transition ${
                    status === 'rejected'
                      ? 'border-zinc-800/50 opacity-50'
                      : status === 'waiting'
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
                            dvResult?.deep_vet_score ?? job.ai_score
                          )}`}
                        >
                          {dvResult?.deep_vet_score ?? job.ai_score}/10
                        </span>
                        {/* Verdict badge */}
                        <span
                          className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${verdictBadge(
                            dvResult?.deep_vet_verdict ?? job.ai_verdict
                          )}`}
                        >
                          {dvResult?.deep_vet_verdict ?? job.ai_verdict}
                        </span>
                        {/* Status badges */}
                        {status === 'waiting' && (
                          <span className="inline-flex items-center rounded-md bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
                            Waiting
                          </span>
                        )}
                        {status === 'rejected' && (
                          <span className="inline-flex items-center rounded-md bg-red-500/10 px-2 py-0.5 text-xs text-red-400">
                            Rejected
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
                      {dvResult?.deep_vet_reasoning ?? job.ai_reasoning}
                    </p>

                    {/* Additional deep vet info */}
                    {dvResult && !dvResult.error && (
                      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                        {dvResult.deep_vet_approach && (
                          <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                            <p className="mb-1 text-xs font-medium text-zinc-500">Approach</p>
                            <p className="text-sm text-zinc-300">{dvResult.deep_vet_approach}</p>
                          </div>
                        )}
                        {dvResult.deep_vet_risks && (
                          <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                            <p className="mb-1 text-xs font-medium text-zinc-500">Risks</p>
                            <p className="text-sm text-zinc-300">{dvResult.deep_vet_risks}</p>
                          </div>
                        )}
                        {dvResult.deep_vet_opportunities && (
                          <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                            <p className="mb-1 text-xs font-medium text-zinc-500">Opportunities</p>
                            <p className="text-sm text-zinc-300">{dvResult.deep_vet_opportunities}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {dvResult?.ai_estimated_effort && (
                      <div className="mt-3">
                        <span className="inline-flex items-center gap-1.5 rounded-md bg-blue-500/10 px-2 py-0.5 text-xs text-blue-400">
                          Estimated effort: {dvResult.ai_estimated_effort}
                        </span>
                      </div>
                    )}

                    {dvResult?.error && (
                      <div className="mt-3 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">
                        Deep vet error: {dvResult.error}
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
                        <div className="flex justify-end">
                          <button
                            onClick={() => handleSkip(job.id)}
                            className="text-sm text-zinc-500 transition hover:text-zinc-300"
                          >
                            Skip
                          </button>
                        </div>
                      </div>
                    )}

                    {/* ─── Action buttons (post deep vet) ───────── */}

                    {phase === 'deep-vetted' &&
                      dvResult &&
                      !dvResult.error &&
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
                              'GO -- Build Demo'
                            )}
                          </button>
                          <button
                            onClick={() => handleGo(job, 'loom_only')}
                            disabled={isGenerating}
                            className="rounded-lg bg-blue-500/20 px-3 py-2 text-sm font-medium text-blue-400 transition hover:bg-blue-500/30 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            GO -- Loom Only
                          </button>
                          <button
                            onClick={() =>
                              setShowRejectInput((prev) => ({
                                ...prev,
                                [job.id]: true,
                              }))
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
                        </div>
                      )}

                    {/* Reject reason input */}
                    {showRejectInput[job.id] && status === 'active' && (
                      <div className="mt-3 flex items-center gap-2">
                        <input
                          type="text"
                          value={rejectionReasons[job.id] || ''}
                          onChange={(e) =>
                            setRejectionReasons((prev) => ({
                              ...prev,
                              [job.id]: e.target.value,
                            }))
                          }
                          placeholder="Rejection reason (optional)"
                          className="flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none transition focus:border-zinc-600"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleReject(job.id)
                          }}
                        />
                        <button
                          onClick={() => handleReject(job.id)}
                          className="rounded-lg bg-red-500/20 px-3 py-2 text-sm text-red-400 transition hover:bg-red-500/30"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() =>
                            setShowRejectInput((prev) => ({
                              ...prev,
                              [job.id]: false,
                            }))
                          }
                          className="text-sm text-zinc-500 transition hover:text-zinc-300"
                        >
                          Cancel
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
          {activeJobs.length === 0 && parsedJobs.length > 0 && (
            <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-5 py-12 text-center">
              <p className="text-sm text-zinc-400">
                All jobs have been skipped. Click "New Run" to start over.
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
