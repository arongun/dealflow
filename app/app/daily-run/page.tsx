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
  has_hire: boolean
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
  final_claude_prompt: string | null
  final_loom_script: string | null
  final_proposal_text: string | null
  demo_token: string | null
  demo_password: string | null
  loom_duration: string | null
}

interface ParseResponse {
  total_found: number
  total_parsed: number
  total_go: number
  total_no_go: number
  total_review: number
  total_blocked: number
  total_pre_filtered: number
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
type JobStatus = 'active' | 'skipped' | 'waiting' | 'went-go'

const VERDICT_OPTIONS = ['GO', 'NEEDS_REVIEW', 'NO-GO'] as const

// ── Helpers ────────────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 3.5) return 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20'
  if (score >= 2.5) return 'text-amber-400 bg-amber-500/10 border border-amber-500/20'
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

function formatPostedAt(dateStr: string | null): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ' ' +
    d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
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
  const [parseProgress, setParseProgress] = useState('')
  const [parseSummary, setParseSummary] = useState<ParseResponse | null>(null)
  const [jobs, setJobs] = useState<DailyRunJob[]>([])
  const [initialLoadDone, setInitialLoadDone] = useState(false)

  // Phase 2 state
  const [deepVetLoading, setDeepVetLoading] = useState(false)
  const [generatedContent, setGeneratedContent] = useState<Record<string, GeneratedContent>>({})
  const [generatingJobs, setGeneratingJobs] = useState<Record<string, boolean>>({})

  // Editable generated content (user can edit after generation)
  const [editedPrompts, setEditedPrompts] = useState<Record<string, string>>({})
  const [editedScripts, setEditedScripts] = useState<Record<string, string>>({})
  const [editedProposals, setEditedProposals] = useState<Record<string, string>>({})
  const [savingContent, setSavingContent] = useState<Record<string, boolean>>({})

  // Per-job input state (local edits before save, persisted to localStorage)
  const [upworkLinks, setUpworkLinks] = useState<Record<string, string>>(() => {
    if (typeof window === 'undefined') return {}
    try {
      return JSON.parse(localStorage.getItem('dailyrun_upworkLinks') || '{}')
    } catch { return {} }
  })
  const [fullDescriptions, setFullDescriptions] = useState<Record<string, string>>(() => {
    if (typeof window === 'undefined') return {}
    try {
      return JSON.parse(localStorage.getItem('dailyrun_fullDescriptions') || '{}')
    } catch { return {} }
  })

  // Per-job status state
  const [jobStatuses, setJobStatuses] = useState<Record<string, JobStatus>>({})

  // Inline skip input state (per-job)
  const [skipInputOpen, setSkipInputOpen] = useState<Record<string, boolean>>({})
  const [skipNotes, setSkipNotes] = useState<Record<string, string>>({})

  // Verdict override dropdown
  const [showVerdictDropdown, setShowVerdictDropdown] = useState<string | null>(null)

  // Detail modal
  const [detailJobId, setDetailJobId] = useState<string | null>(null)

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

          // Merge DB values with localStorage (localStorage wins for unsaved edits)
          let savedLinks: Record<string, string> = {}
          let savedDescs: Record<string, string> = {}
          try {
            savedLinks = JSON.parse(localStorage.getItem('dailyrun_upworkLinks') || '{}')
            savedDescs = JSON.parse(localStorage.getItem('dailyrun_fullDescriptions') || '{}')
          } catch { /* ignore */ }

          sorted.forEach((j) => {
            statuses[j.id] = 'active'
            links[j.id] = savedLinks[j.id] || j.upwork_link || ''
            descs[j.id] = savedDescs[j.id] || j.full_description || ''
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

  // ── Persist input fields to localStorage ────────────────────

  useEffect(() => {
    localStorage.setItem('dailyrun_upworkLinks', JSON.stringify(upworkLinks))
  }, [upworkLinks])

  useEffect(() => {
    localStorage.setItem('dailyrun_fullDescriptions', JSON.stringify(fullDescriptions))
  }, [fullDescriptions])

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
    setParseProgress('Starting analysis...')
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
        const errText = await res.text()
        let errMsg = 'Parse failed'
        try { errMsg = JSON.parse(errText).error || errMsg } catch {}
        throw new Error(errMsg)
      }

      // Read SSE stream
      const reader = res.body?.getReader()
      if (!reader) throw new Error('No response stream')

      const decoder = new TextDecoder()
      let buffer = ''
      let summaryData: ParseResponse | null = null
      let totalJobsSoFar = 0

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // Parse SSE events from buffer
        const lines = buffer.split('\n')
        buffer = ''

        let currentEvent = ''
        let currentData = ''

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim()
          } else if (line.startsWith('data: ')) {
            currentData = line.slice(6)
          } else if (line === '' && currentEvent && currentData) {
            // Process complete event
            try {
              const payload = JSON.parse(currentData)

              if (currentEvent === 'batch') {
                const batchJobs: DailyRunJob[] = payload.jobs ?? []
                totalJobsSoFar += payload.batchStats?.parsed ?? batchJobs.length

                setParseProgress(
                  `Batch ${payload.batch}/${payload.totalBatches} complete — ${totalJobsSoFar} jobs analyzed`
                )

                // Filter to GO + NEEDS_REVIEW and add to state
                const displayJobs = batchJobs.filter(
                  (j: DailyRunJob) => j.ai_verdict === 'GO' || j.ai_verdict === 'NEEDS_REVIEW'
                )

                if (displayJobs.length > 0) {
                  setJobs((prev) => {
                    const existingIds = new Set(prev.map((j) => j.id))
                    const newJobs = displayJobs.filter((j: DailyRunJob) => !existingIds.has(j.id))
                    return [...prev, ...newJobs].sort(
                      (a, b) => (b.ai_score ?? 0) - (a.ai_score ?? 0)
                    )
                  })

                  setJobStatuses((prev) => {
                    const next = { ...prev }
                    displayJobs.forEach((j: DailyRunJob) => {
                      if (!next[j.id]) next[j.id] = 'active'
                    })
                    return next
                  })

                  // Show cards as they arrive
                  setPhase('parsed')
                }
              } else if (currentEvent === 'summary') {
                summaryData = {
                  total_found: payload.total_found ?? 0,
                  total_parsed: payload.total_parsed ?? 0,
                  total_go: payload.total_go ?? 0,
                  total_no_go: payload.total_no_go ?? 0,
                  total_review: payload.total_review ?? 0,
                  total_blocked: payload.total_blocked ?? 0,
                  total_pre_filtered: payload.total_pre_filtered ?? 0,
                  jobs: [],
                }
                setParseSummary(summaryData)
              } else if (currentEvent === 'error') {
                toast(payload.message || `Batch ${payload.batch} failed`, 'error')
              }
              // 'done' event — stream complete, loop will end naturally
            } catch {
              // Ignore malformed JSON
            }

            currentEvent = ''
            currentData = ''
          } else if (line !== '') {
            // Incomplete event, keep in buffer
            buffer += line + '\n'
          }
        }
      }

      setPhase('parsed')
      if (summaryData) {
        const s = summaryData
        const preFilterMsg = s.total_pre_filtered > 0 ? `${s.total_pre_filtered} dupes skipped, ` : ''
        toast(`Analysis complete: ${preFilterMsg}${s.total_go} GO, ${s.total_review} to review`, 'success')
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to analyze jobs'
      toast(message, 'error')
    } finally {
      setParseLoading(false)
      setParseProgress('')
    }
  }, [rawText, selectedSearchId, toast])

  // ── Phase 2: Deep Vet ───────────────────────────────────────

  const handleDeepVet = useCallback(async () => {
    // Only deep vet jobs that have BOTH upwork link AND full description filled
    const jobsToVet = jobs.filter(
      (j) =>
        upworkLinks[j.id]?.trim() &&
        fullDescriptions[j.id]?.trim() &&
        jobStatuses[j.id] !== 'skipped' &&
        jobStatuses[j.id] !== 'went-go' &&
        jobStatuses[j.id] !== 'waiting'
    )

    if (jobsToVet.length === 0) {
      toast('Fill in the Upwork link and full description for at least one job', 'error')
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
        // Update pipeline stage (server auto-computes verdict_override)
        const stageRes = await fetch(`/api/jobs/${job.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pipeline_stage: 'go',
            build_type: buildType,
          }),
        })
        if (stageRes.ok) {
          const updated = await stageRes.json()
          setJobs((prev) =>
            prev.map((j) =>
              j.id === job.id ? { ...j, verdict_override: updated.verdict_override } : j
            )
          )
        }

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
        // Initialize editable fields with generated content
        if (content.prompt) setEditedPrompts((prev) => ({ ...prev, [job.id]: content.prompt! }))
        if (content.script) setEditedScripts((prev) => ({ ...prev, [job.id]: content.script! }))
        if (content.proposal) setEditedProposals((prev) => ({ ...prev, [job.id]: content.proposal! }))
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

  const handleSkipConfirm = useCallback(
    async (jobId: string) => {
      const notes = skipNotes[jobId] || ''
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
        setSkipInputOpen((prev) => ({ ...prev, [jobId]: false }))
        setSkipNotes((prev) => ({ ...prev, [jobId]: '' }))
        toast('Job skipped', 'info')
      } catch {
        toast('Failed to skip job', 'error')
      }
    },
    [skipNotes, toast]
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
      // Find the original AI verdict for this job
      const job = jobs.find((j) => j.id === jobId)
      const origVerdict = job
        ? (job.deep_vet_verdict ?? job.ai_verdict)
        : null
      // If the new verdict matches the original, store NULL (no override)
      const valueToStore = newVerdict === origVerdict ? null : newVerdict

      try {
        await fetch(`/api/jobs/${jobId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ verdict_override: valueToStore }),
        })
        setJobs((prev) =>
          prev.map((j) => (j.id === jobId ? { ...j, verdict_override: valueToStore } : j))
        )
        setShowVerdictDropdown(null)
        if (valueToStore) {
          toast(`Verdict overridden to ${verdictLabel(valueToStore)}`, 'success')
        } else {
          toast('Verdict reset to AI verdict', 'info')
        }
      } catch {
        toast('Failed to override verdict', 'error')
      }
    },
    [jobs, toast]
  )

  // ── Save edited content ────────────────────────────────────

  const handleSaveContent = useCallback(
    async (jobId: string) => {
      setSavingContent((prev) => ({ ...prev, [jobId]: true }))
      try {
        const updates: Record<string, string | null> = {}
        if (editedPrompts[jobId] !== undefined) updates.final_claude_prompt = editedPrompts[jobId]
        if (editedScripts[jobId] !== undefined) updates.final_loom_script = editedScripts[jobId]
        if (editedProposals[jobId] !== undefined) updates.final_proposal_text = editedProposals[jobId]

        const res = await fetch(`/api/jobs/${jobId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        })
        if (res.ok) {
          toast('Changes saved', 'success')
        } else {
          toast('Failed to save', 'error')
        }
      } catch {
        toast('Failed to save', 'error')
      } finally {
        setSavingContent((prev) => ({ ...prev, [jobId]: false }))
      }
    },
    [editedPrompts, editedScripts, editedProposals, toast]
  )

  // ── Derived state ───────────────────────────────────────────

  const deepVetReady = jobs.some(
    (j) =>
      upworkLinks[j.id]?.trim() &&
      fullDescriptions[j.id]?.trim() &&
      jobStatuses[j.id] !== 'skipped'
  )

  const activeJobs = jobs.filter(
    (j) => jobStatuses[j.id] !== 'skipped'
  )

  // ── Reset ───────────────────────────────────────────────────

  const handleReset = useCallback(() => {
    setPhase('input')
    setRawText('')
    setParseProgress('')
    setParseSummary(null)
    setJobs([])
    setDeepVetLoading(false)
    setGeneratedContent({})
    setGeneratingJobs({})
    setUpworkLinks({})
    setFullDescriptions({})
    setJobStatuses({})
    setSkipInputOpen({})
    setSkipNotes({})
    setShowVerdictDropdown(null)
    setEditedPrompts({})
    setEditedScripts({})
    setEditedProposals({})
    setSavingContent({})
    localStorage.removeItem('dailyrun_upworkLinks')
    localStorage.removeItem('dailyrun_fullDescriptions')
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
    <div className="min-h-screen bg-zinc-950 mx-auto max-w-4xl px-6">
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
                    {parseProgress || 'Analyzing jobs...'}
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
            {parseSummary.total_pre_filtered > 0 && (
              <>
                <ChevronRight />
                <span className="text-zinc-400">
                  {parseSummary.total_pre_filtered} duplicates skipped
                </span>
              </>
            )}
            {parseSummary.total_blocked > 0 && (
              <>
                <ChevronRight />
                <span className="text-zinc-400">
                  {parseSummary.total_blocked} blocked
                </span>
              </>
            )}
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
                  Paste the Upwork link and full job description for each job you want to analyze. Jobs without both fields filled will be left as-is — skip them manually if needed.
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
                          {effectiveScore}/5
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

                        {/* Expand details button */}
                        <button
                          onClick={() => setDetailJobId(job.id)}
                          className="rounded-md bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-400 transition hover:bg-zinc-700 hover:text-zinc-300"
                          title="View full details"
                        >
                          Details
                        </button>

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

                    {/* Job details row */}
                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500">
                      {job.saved_search_id && (() => {
                        const search = savedSearches.find(s => s.id === job.saved_search_id)
                        return search ? <span className="text-blue-400">{search.name}</span> : null
                      })()}
                      {job.client_location && (
                        <span>{job.client_location}</span>
                      )}
                      {job.client_spend && (
                        <span>Spent: {job.client_spend}</span>
                      )}
                      {job.client_rating != null && (
                        <span>Rating: {job.client_rating}</span>
                      )}
                      {job.proposals_count != null && (
                        <span>{job.proposals_count} proposals</span>
                      )}
                      {job.has_hire && (
                        <span className="text-red-400 font-medium">Hired</span>
                      )}
                      {job.posted_at && (
                        <span>Posted: {formatPostedAt(job.posted_at)}</span>
                      )}
                    </div>

                    {/* Skills */}
                    {job.skills && job.skills.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {job.skills.map((skill) => (
                          <span
                            key={skill}
                            className="rounded-full bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-400"
                          >
                            {skill}
                          </span>
                        ))}
                      </div>
                    )}

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
                        <div className="flex items-center justify-end gap-2">
                          {skipInputOpen[job.id] ? (
                            <>
                              <input
                                type="text"
                                autoFocus
                                value={skipNotes[job.id] || ''}
                                onChange={(e) =>
                                  setSkipNotes((prev) => ({
                                    ...prev,
                                    [job.id]: e.target.value,
                                  }))
                                }
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleSkipConfirm(job.id)
                                  if (e.key === 'Escape') setSkipInputOpen((prev) => ({ ...prev, [job.id]: false }))
                                }}
                                placeholder="Note (optional)"
                                className="min-w-[120px] max-w-[300px] rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm text-white placeholder-zinc-600 outline-none transition-all focus:border-zinc-500"
                                style={{ width: `${Math.max(120, (skipNotes[job.id]?.length || 0) * 8 + 40)}px` }}
                              />
                              <button
                                onClick={() => handleSkipConfirm(job.id)}
                                className="rounded-lg bg-red-500/20 px-3 py-1.5 text-sm font-medium text-red-400 transition hover:bg-red-500/30"
                              >
                                Skip
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() =>
                                setSkipInputOpen((prev) => ({
                                  ...prev,
                                  [job.id]: true,
                                }))
                              }
                              className="text-sm text-zinc-500 transition hover:text-zinc-300"
                            >
                              Skip
                            </button>
                          )}
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
                            onClick={() => handleWait(job.id)}
                            className="rounded-lg bg-zinc-800 px-3 py-2 text-sm text-zinc-400 transition hover:bg-zinc-700 hover:text-zinc-300"
                          >
                            Wait
                          </button>
                          <div className="ml-auto flex items-center gap-2">
                            {skipInputOpen[job.id] ? (
                              <>
                                <input
                                  type="text"
                                  autoFocus
                                  value={skipNotes[job.id] || ''}
                                  onChange={(e) =>
                                    setSkipNotes((prev) => ({
                                      ...prev,
                                      [job.id]: e.target.value,
                                    }))
                                  }
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSkipConfirm(job.id)
                                    if (e.key === 'Escape') setSkipInputOpen((prev) => ({ ...prev, [job.id]: false }))
                                  }}
                                  placeholder="Note (optional)"
                                  className="min-w-[120px] max-w-[300px] rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm text-white placeholder-zinc-600 outline-none transition-all focus:border-zinc-500"
                                  style={{ width: `${Math.max(120, (skipNotes[job.id]?.length || 0) * 8 + 40)}px` }}
                                />
                                <button
                                  onClick={() => handleSkipConfirm(job.id)}
                                  className="rounded-lg bg-red-500/20 px-3 py-1.5 text-sm font-medium text-red-400 transition hover:bg-red-500/30"
                                >
                                  Skip
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() =>
                                  setSkipInputOpen((prev) => ({
                                    ...prev,
                                    [job.id]: true,
                                  }))
                                }
                                className="text-sm text-zinc-500 transition hover:text-zinc-300"
                              >
                                Skip
                              </button>
                            )}
                          </div>
                        </div>
                      )}

                    {/* Show action buttons for active jobs without deep vet in deep-vetted phase */}
                    {phase === 'deep-vetted' &&
                      !hasDeepVet &&
                      status === 'active' && (
                        <div className="mt-4 flex flex-wrap items-center gap-2">
                          <span className="text-xs text-zinc-500 italic">No deep vet data</span>
                          <div className="ml-auto flex items-center gap-2">
                            {skipInputOpen[job.id] ? (
                              <>
                                <input
                                  type="text"
                                  autoFocus
                                  value={skipNotes[job.id] || ''}
                                  onChange={(e) =>
                                    setSkipNotes((prev) => ({
                                      ...prev,
                                      [job.id]: e.target.value,
                                    }))
                                  }
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSkipConfirm(job.id)
                                    if (e.key === 'Escape') setSkipInputOpen((prev) => ({ ...prev, [job.id]: false }))
                                  }}
                                  placeholder="Note (optional)"
                                  className="min-w-[120px] max-w-[300px] rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm text-white placeholder-zinc-600 outline-none transition-all focus:border-zinc-500"
                                  style={{ width: `${Math.max(120, (skipNotes[job.id]?.length || 0) * 8 + 40)}px` }}
                                />
                                <button
                                  onClick={() => handleSkipConfirm(job.id)}
                                  className="rounded-lg bg-red-500/20 px-3 py-1.5 text-sm font-medium text-red-400 transition hover:bg-red-500/30"
                                >
                                  Skip
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() =>
                                  setSkipInputOpen((prev) => ({
                                    ...prev,
                                    [job.id]: true,
                                  }))
                                }
                                className="text-sm text-zinc-500 transition hover:text-zinc-300"
                              >
                                Skip
                              </button>
                            )}
                          </div>
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
                              <CopyButton text={editedPrompts[job.id] ?? content.prompt} label="Copy" />
                            </div>
                            <textarea
                              value={editedPrompts[job.id] ?? content.prompt}
                              onChange={(e) => setEditedPrompts((prev) => ({ ...prev, [job.id]: e.target.value }))}
                              className="max-h-[400px] min-h-[200px] w-full resize-y rounded-lg border border-zinc-700 bg-zinc-950 p-3 font-mono text-sm text-zinc-300 outline-none transition focus:border-zinc-500"
                            />
                          </div>
                        )}

                        {content.script && (
                          <div>
                            <div className="mb-2 flex items-center justify-between">
                              <span className="text-xs font-medium text-zinc-500">
                                Loom Script
                              </span>
                              <CopyButton text={editedScripts[job.id] ?? content.script} label="Copy" />
                            </div>
                            <textarea
                              value={editedScripts[job.id] ?? content.script}
                              onChange={(e) => setEditedScripts((prev) => ({ ...prev, [job.id]: e.target.value }))}
                              className="max-h-[400px] min-h-[200px] w-full resize-y rounded-lg border border-zinc-700 bg-zinc-950 p-3 font-mono text-sm text-zinc-300 outline-none transition focus:border-zinc-500"
                            />
                          </div>
                        )}

                        {content.proposal && (
                          <div>
                            <div className="mb-2 flex items-center justify-between">
                              <span className="text-xs font-medium text-zinc-500">
                                Proposal Text
                              </span>
                              <CopyButton text={editedProposals[job.id] ?? content.proposal} label="Copy" />
                            </div>
                            <textarea
                              value={editedProposals[job.id] ?? content.proposal}
                              onChange={(e) => setEditedProposals((prev) => ({ ...prev, [job.id]: e.target.value }))}
                              className="max-h-[300px] min-h-[120px] w-full resize-y rounded-lg border border-zinc-700 bg-zinc-950 p-3 text-sm text-zinc-300 outline-none transition focus:border-zinc-500"
                            />
                          </div>
                        )}

                        {/* Save edits button */}
                        <div className="flex justify-end">
                          <button
                            onClick={() => handleSaveContent(job.id)}
                            disabled={savingContent[job.id]}
                            className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-zinc-900 transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {savingContent[job.id] ? 'Saving...' : 'Save Changes'}
                          </button>
                        </div>
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
            {parseProgress || <>Analyzing jobs<LoadingDots /></>}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            Jobs appear as each batch completes.
          </p>
        </div>
      )}

      {/* ─── Detail Modal ─────────────────────────────────────── */}
      {detailJobId && (() => {
        const job = jobs.find(j => j.id === detailJobId)
        if (!job) return null
        const content = generatedContent[job.id]
        const isGenerating = generatingJobs[job.id]
        const status = jobStatuses[job.id]
        const hasDeepVet = job.deep_vet_score !== null
        const originalVerdict = hasDeepVet ? (job.deep_vet_verdict ?? job.ai_verdict) : job.ai_verdict
        const effectiveVerdict = job.verdict_override ?? originalVerdict
        const effectiveScore = hasDeepVet ? (job.deep_vet_score ?? job.ai_score) : job.ai_score
        const searchName = savedSearches.find(s => s.id === job.saved_search_id)?.name

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setDetailJobId(null)}>
            <div className="absolute inset-0 bg-black/60" />
            <div
              className="relative z-10 mx-4 flex max-h-[90vh] w-full max-w-3xl flex-col rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal header */}
              <div className="flex items-start justify-between border-b border-zinc-800 px-6 py-4">
                <div className="min-w-0 flex-1 pr-4">
                  <h2 className="text-lg font-semibold text-white">{job.title}</h2>
                  <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs">
                    {searchName && <span className="text-blue-400">{searchName}</span>}
                    {job.budget_display && <span className="text-zinc-400">{job.budget_display}</span>}
                    <span className={`inline-flex items-center rounded px-1.5 py-0.5 font-medium ${scoreColor(effectiveScore)}`}>
                      {effectiveScore}/5
                    </span>
                    <span className={`inline-flex items-center rounded px-1.5 py-0.5 font-medium ${verdictBadgeBg(effectiveVerdict)} ${verdictTextColor(effectiveVerdict)}`}>
                      {verdictLabel(effectiveVerdict)}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setDetailJobId(null)}
                  className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-zinc-800 hover:text-white"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Modal body */}
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
                {/* Client info grid */}
                <div className="grid grid-cols-3 gap-2 text-xs">
                  {job.client_location && (
                    <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2">
                      <span className="block text-zinc-600">Location</span>
                      <span className="text-zinc-300">{job.client_location}</span>
                    </div>
                  )}
                  {job.client_spend && (
                    <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2">
                      <span className="block text-zinc-600">Spend</span>
                      <span className="text-zinc-300">{job.client_spend}</span>
                    </div>
                  )}
                  {job.client_rating != null && (
                    <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2">
                      <span className="block text-zinc-600">Rating</span>
                      <span className="text-zinc-300">{job.client_rating}</span>
                    </div>
                  )}
                  {job.proposals_count != null && (
                    <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2">
                      <span className="block text-zinc-600">Proposals</span>
                      <span className="text-zinc-300">{job.proposals_count}</span>
                    </div>
                  )}
                  {job.has_hire && (
                    <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2">
                      <span className="block text-red-400/70">Status</span>
                      <span className="text-red-400 font-medium">Hired</span>
                    </div>
                  )}
                  {job.posted_at && (
                    <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2">
                      <span className="block text-zinc-600">Posted</span>
                      <span className="text-zinc-300">{formatPostedAt(job.posted_at)}</span>
                    </div>
                  )}
                  {job.budget_type && (
                    <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2">
                      <span className="block text-zinc-600">Type</span>
                      <span className="text-zinc-300">{job.budget_type}</span>
                    </div>
                  )}
                </div>

                {/* Skills */}
                {job.skills && job.skills.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {job.skills.map((skill) => (
                      <span key={skill} className="rounded-full bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-400">
                        {skill}
                      </span>
                    ))}
                  </div>
                )}

                {/* Description snippet */}
                {job.description_snippet && (
                  <div>
                    <h4 className="mb-1 text-xs font-medium text-zinc-500">Description</h4>
                    <p className="text-sm text-zinc-400 leading-relaxed">{job.description_snippet}</p>
                  </div>
                )}

                {/* Full description */}
                {job.full_description && (
                  <div>
                    <h4 className="mb-1 text-xs font-medium text-zinc-500">Full Job Description</h4>
                    <pre className="max-h-48 overflow-auto rounded-lg border border-zinc-800 bg-zinc-900 p-3 text-xs text-zinc-400 leading-relaxed whitespace-pre-wrap">
                      {job.full_description}
                    </pre>
                  </div>
                )}

                {/* AI Reasoning */}
                <div>
                  <h4 className="mb-1 text-xs font-medium text-zinc-500">AI Reasoning</h4>
                  <p className="text-sm text-zinc-300 leading-relaxed">
                    {hasDeepVet ? (job.deep_vet_reasoning ?? job.ai_reasoning) : job.ai_reasoning}
                  </p>
                </div>

                {/* Deep vet details */}
                {hasDeepVet && (
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    {job.deep_vet_approach && (
                      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
                        <p className="mb-1 text-xs font-medium text-zinc-500">Approach</p>
                        <p className="text-sm text-zinc-300">{job.deep_vet_approach}</p>
                      </div>
                    )}
                    {job.deep_vet_risks && (
                      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
                        <p className="mb-1 text-xs font-medium text-zinc-500">Risks</p>
                        <p className="text-sm text-zinc-300">{job.deep_vet_risks}</p>
                      </div>
                    )}
                    {job.deep_vet_opportunities && (
                      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
                        <p className="mb-1 text-xs font-medium text-zinc-500">Opportunities</p>
                        <p className="text-sm text-zinc-300">{job.deep_vet_opportunities}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Effort */}
                {job.ai_estimated_effort && (
                  <div className="inline-flex items-center gap-1.5 rounded-md bg-blue-500/10 px-2.5 py-1 text-xs text-blue-400">
                    {job.ai_estimated_effort}
                  </div>
                )}

                {/* Upwork link */}
                {job.upwork_link && (
                  <a
                    href={job.upwork_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
                  >
                    Open on Upwork
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                    </svg>
                  </a>
                )}

                {/* Generated content preview */}
                {content && !isGenerating && (
                  <div className="space-y-3">
                    {content.prompt && (
                      <div>
                        <div className="mb-1 flex items-center justify-between">
                          <span className="text-xs font-medium text-zinc-500">Claude Code Prompt</span>
                          <CopyButton text={editedPrompts[job.id] ?? content.prompt} label="Copy" />
                        </div>
                        <textarea
                          value={editedPrompts[job.id] ?? content.prompt}
                          onChange={(e) => setEditedPrompts((prev) => ({ ...prev, [job.id]: e.target.value }))}
                          className="max-h-[300px] min-h-[150px] w-full resize-y rounded-lg border border-zinc-700 bg-zinc-900 p-3 font-mono text-xs text-zinc-300 outline-none transition focus:border-zinc-500"
                        />
                      </div>
                    )}
                    {content.script && (
                      <div>
                        <div className="mb-1 flex items-center justify-between">
                          <span className="text-xs font-medium text-zinc-500">Loom Script</span>
                          <CopyButton text={editedScripts[job.id] ?? content.script} label="Copy" />
                        </div>
                        <textarea
                          value={editedScripts[job.id] ?? content.script}
                          onChange={(e) => setEditedScripts((prev) => ({ ...prev, [job.id]: e.target.value }))}
                          className="max-h-[300px] min-h-[150px] w-full resize-y rounded-lg border border-zinc-700 bg-zinc-900 p-3 font-mono text-xs text-zinc-300 outline-none transition focus:border-zinc-500"
                        />
                      </div>
                    )}
                    {content.proposal && (
                      <div>
                        <div className="mb-1 flex items-center justify-between">
                          <span className="text-xs font-medium text-zinc-500">Proposal Text</span>
                          <CopyButton text={editedProposals[job.id] ?? content.proposal} label="Copy" />
                        </div>
                        <textarea
                          value={editedProposals[job.id] ?? content.proposal}
                          onChange={(e) => setEditedProposals((prev) => ({ ...prev, [job.id]: e.target.value }))}
                          className="max-h-[200px] min-h-[80px] w-full resize-y rounded-lg border border-zinc-700 bg-zinc-900 p-3 text-xs text-zinc-300 outline-none transition focus:border-zinc-500"
                        />
                      </div>
                    )}
                    <div className="flex justify-end">
                      <button
                        onClick={() => handleSaveContent(job.id)}
                        disabled={savingContent[job.id]}
                        className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-zinc-900 transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {savingContent[job.id] ? 'Saving...' : 'Save Changes'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Modal footer — action buttons */}
              {status === 'active' && hasDeepVet && phase === 'deep-vetted' && (
                <div className="flex items-center gap-2 border-t border-zinc-800 px-6 py-4">
                  <button
                    onClick={() => { handleGo(job, 'build'); setDetailJobId(null) }}
                    disabled={isGenerating}
                    className="rounded-lg bg-emerald-500/20 px-4 py-2 text-sm font-medium text-emerald-400 transition hover:bg-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isGenerating ? 'Generating...' : 'GO — Build Demo'}
                  </button>
                  <button
                    onClick={() => { handleGo(job, 'loom_only'); setDetailJobId(null) }}
                    disabled={isGenerating}
                    className="rounded-lg bg-blue-500/20 px-4 py-2 text-sm font-medium text-blue-400 transition hover:bg-blue-500/30 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    GO — Loom Only
                  </button>
                  <button
                    onClick={() => { handleWait(job.id); setDetailJobId(null) }}
                    className="rounded-lg bg-zinc-800 px-4 py-2 text-sm text-zinc-400 transition hover:bg-zinc-700 hover:text-zinc-300"
                  >
                    Wait
                  </button>
                  <button
                    onClick={() => { handleSkipConfirm(job.id); setDetailJobId(null) }}
                    className="rounded-lg bg-red-500/20 px-4 py-2 text-sm font-medium text-red-400 transition hover:bg-red-500/30"
                  >
                    Skip
                  </button>
                </div>
              )}
            </div>
          </div>
        )
      })()}

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
