'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useToast } from '../components/toast'
import { CopyButton } from '../components/copy-button'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PipelineStage =
  | 'new'
  | 'go'
  | 'building'
  | 'ready'
  | 'applied'
  | 'replied'
  | 'won'
  | 'lost'
  | 'rejected'
  | 'waiting'

interface Job {
  id: string
  title: string
  description_snippet: string | null
  budget_display: string | null
  budget_type: string | null
  client_location: string | null
  client_spend: string | null
  client_rating: string | null
  proposals_count: string | null
  skills: string[]
  posted_at: string | null
  ai_score: number | null
  ai_verdict: 'GO' | 'NO-GO' | 'NEEDS_REVIEW' | null
  ai_reasoning: string | null
  pipeline_stage: PipelineStage | string
  build_type: 'build' | 'loom_only' | null
  build_status: string | null
  upwork_link: string | null
  full_description: string | null
  demo_url: string | null
  demo_token: string | null
  demo_password: string | null
  loom_link: string | null
  notes: string | null
  rejection_reason: string | null
  client_reply: string | null
  claude_code_prompt: string | null
  loom_script: string | null
  proposal_text: string | null
  deep_vet_score: number | null
  deep_vet_verdict: string | null
  deep_vet_reasoning: string | null
  deep_vet_approach: string | null
  deep_vet_risks: string | null
  deep_vet_opportunities: string | null
  ai_estimated_effort: string | null
  verdict_override: string | null
  created_at: string
  updated_at: string
  stage_changed_at: string | null
}

interface HistoryEntry {
  id: string
  job_id: string
  action: string
  old_value: string | null
  new_value: string | null
  details: string | null
  created_at: string
}

// ---------------------------------------------------------------------------
// Column definitions
// ---------------------------------------------------------------------------

const COLUMNS: { stage: PipelineStage; label: string; description: string }[] = [
  { stage: 'new', label: 'New', description: 'Freshly parsed, awaiting review' },
  { stage: 'go', label: 'Go', description: 'Approved, awaiting build' },
  { stage: 'building', label: 'Building', description: 'Demo being built' },
  { stage: 'ready', label: 'Ready', description: 'Demo built, awaiting Loom' },
  { stage: 'applied', label: 'Applied', description: 'Proposal submitted' },
  { stage: 'replied', label: 'Replied', description: 'Client responded' },
  { stage: 'won', label: 'Closed Won', description: '' },
  { stage: 'lost', label: 'Closed Lost', description: '' },
  { stage: 'waiting', label: 'Waiting', description: 'On hold' },
  { stage: 'rejected', label: 'Rejected', description: '' },
]

const ALL_STAGES: { value: PipelineStage; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'go', label: 'Go' },
  { value: 'building', label: 'Building' },
  { value: 'ready', label: 'Ready' },
  { value: 'applied', label: 'Applied' },
  { value: 'replied', label: 'Replied' },
  { value: 'won', label: 'Closed Won' },
  { value: 'lost', label: 'Closed Lost' },
  { value: 'waiting', label: 'Waiting' },
  { value: 'rejected', label: 'Rejected' },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '--'
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  if (isNaN(then)) return '--'
  const diffMs = now - then

  const seconds = Math.floor(diffMs / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  const weeks = Math.floor(days / 7)

  if (seconds < 60) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`
  return `${weeks}w ago`
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '--'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return '--'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function getScoreColor(score: number | null | undefined): string {
  if (score == null) return 'text-zinc-500 bg-zinc-800'
  if (score >= 7) return 'text-emerald-400 bg-emerald-500/10'
  if (score >= 4) return 'text-amber-400 bg-amber-500/10'
  return 'text-red-400 bg-red-500/10'
}

function getVerdictColor(verdict: string | null | undefined): string {
  if (!verdict) return 'text-zinc-500 bg-zinc-800'
  const v = verdict.toUpperCase()
  if (v === 'GO') return 'text-emerald-400 bg-emerald-500/10'
  if (v === 'NO-GO') return 'text-red-400 bg-red-500/10'
  if (v === 'NEEDS_REVIEW') return 'text-amber-400 bg-amber-500/10'
  return 'text-zinc-500 bg-zinc-800'
}

function getColumnHeaderColor(stage: PipelineStage): string {
  switch (stage) {
    case 'new':
      return 'text-white'
    case 'go':
      return 'text-emerald-400'
    case 'building':
      return 'text-blue-400'
    case 'ready':
      return 'text-violet-400'
    case 'applied':
      return 'text-sky-400'
    case 'replied':
      return 'text-amber-400'
    case 'won':
      return 'text-emerald-400'
    case 'lost':
      return 'text-red-400'
    case 'waiting':
      return 'text-zinc-400'
    case 'rejected':
      return 'text-zinc-500'
    default:
      return 'text-zinc-400'
  }
}

function getDaysInStage(job: Job): string {
  const ref = job.stage_changed_at || job.updated_at || job.created_at
  return formatRelativeTime(ref)
}

// ---------------------------------------------------------------------------
// Main Page Component
// ---------------------------------------------------------------------------

export default function PipelinePage() {
  const { toast } = useToast()
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedJob, setSelectedJob] = useState<Job | null>(null)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  // Panel form state
  const [panelLoomLink, setPanelLoomLink] = useState('')
  const [panelDemoUrl, setPanelDemoUrl] = useState('')
  const [panelNotes, setPanelNotes] = useState('')
  const [panelStage, setPanelStage] = useState<PipelineStage | string>('')
  const [saving, setSaving] = useState(false)

  // Track which fields have been changed to show save indicator
  const [dirtyFields, setDirtyFields] = useState<Set<string>>(new Set())

  // -------------------------------------------------------------------------
  // Fetch all jobs
  // -------------------------------------------------------------------------

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch('/api/jobs')
      if (res.ok) {
        const data: Job[] = await res.json()
        setJobs(data)
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchJobs()
  }, [fetchJobs])

  // -------------------------------------------------------------------------
  // Group jobs by pipeline stage
  // -------------------------------------------------------------------------

  const columnJobs: Record<string, Job[]> = {}
  for (const col of COLUMNS) {
    columnJobs[col.stage] = []
  }
  for (const job of jobs) {
    const stage = job.pipeline_stage
    if (columnJobs[stage]) {
      columnJobs[stage].push(job)
    }
  }
  // Sort each column by created_at newest first
  for (const stage of Object.keys(columnJobs)) {
    columnJobs[stage].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
  }

  // -------------------------------------------------------------------------
  // Open slide-over panel
  // -------------------------------------------------------------------------

  const openPanel = useCallback(async (job: Job) => {
    setSelectedJob(job)
    setPanelLoomLink(job.loom_link || '')
    setPanelDemoUrl(job.demo_url || '')
    setPanelNotes(job.notes || '')
    setPanelStage(job.pipeline_stage)
    setDirtyFields(new Set())

    // Fetch history
    setHistoryLoading(true)
    try {
      const res = await fetch(`/api/jobs/${job.id}/history`)
      if (res.ok) {
        const data: HistoryEntry[] = await res.json()
        setHistory(data)
      } else {
        setHistory([])
      }
    } catch {
      setHistory([])
    } finally {
      setHistoryLoading(false)
    }
  }, [])

  const closePanel = useCallback(() => {
    setSelectedJob(null)
    setHistory([])
    setDirtyFields(new Set())
  }, [])

  // -------------------------------------------------------------------------
  // Patch a single field on blur
  // -------------------------------------------------------------------------

  const patchField = useCallback(
    async (jobId: string, field: string, value: string) => {
      try {
        // For verdict_override, empty string means "reset to null"
        const patchValue = field === 'verdict_override' && value === '' ? null : value
        const res = await fetch(`/api/jobs/${jobId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ [field]: patchValue }),
        })
        if (res.ok) {
          const updated: Job = await res.json()
          setJobs((prev) => prev.map((j) => (j.id === jobId ? updated : j)))
          if (selectedJob?.id === jobId) {
            setSelectedJob(updated)
          }
          setDirtyFields((prev) => {
            const next = new Set(prev)
            next.delete(field)
            return next
          })
        } else {
          toast('Failed to save changes', 'error')
        }
      } catch {
        toast('Failed to save changes', 'error')
      }
    },
    [selectedJob, toast]
  )

  // -------------------------------------------------------------------------
  // Change pipeline stage
  // -------------------------------------------------------------------------

  const changeStage = useCallback(
    async (jobId: string, newStage: PipelineStage) => {
      try {
        const res = await fetch(`/api/jobs/${jobId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pipeline_stage: newStage }),
        })
        if (res.ok) {
          const updated: Job = await res.json()
          setJobs((prev) => prev.map((j) => (j.id === jobId ? updated : j)))
          if (selectedJob?.id === jobId) {
            setSelectedJob(updated)
          }
          const stageLabel =
            ALL_STAGES.find((s) => s.value === newStage)?.label || newStage
          toast(`Moved to ${stageLabel}`, 'success')

          // Refresh history
          const histRes = await fetch(`/api/jobs/${jobId}/history`)
          if (histRes.ok) {
            const data: HistoryEntry[] = await histRes.json()
            setHistory(data)
          }
        } else {
          toast('Failed to update stage', 'error')
        }
      } catch {
        toast('Failed to update stage', 'error')
      }
    },
    [selectedJob, toast]
  )

  // -------------------------------------------------------------------------
  // Save all panel fields explicitly
  // -------------------------------------------------------------------------

  const saveAllFields = useCallback(async () => {
    if (!selectedJob) return
    setSaving(true)
    try {
      const res = await fetch(`/api/jobs/${selectedJob.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          loom_link: panelLoomLink,
          demo_url: panelDemoUrl,
          notes: panelNotes,
        }),
      })
      if (res.ok) {
        const updated: Job = await res.json()
        setJobs((prev) => prev.map((j) => (j.id === updated.id ? updated : j)))
        setSelectedJob(updated)
        setDirtyFields(new Set())
        toast('All changes saved', 'success')
      } else {
        toast('Failed to save', 'error')
      }
    } catch {
      toast('Failed to save', 'error')
    } finally {
      setSaving(false)
    }
  }, [selectedJob, panelLoomLink, panelDemoUrl, panelNotes, toast])

  // -------------------------------------------------------------------------
  // Render: Loading state
  // -------------------------------------------------------------------------

  if (loading) {
    return (
      <div>
        <h1 className="text-lg font-semibold text-white mb-6">Pipeline</h1>
        <div className="flex items-center gap-3 text-zinc-500">
          <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          <span className="text-sm">Loading pipeline...</span>
        </div>
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // Render: Main Kanban Board
  // -------------------------------------------------------------------------

  const totalActive = jobs.filter((j) =>
    ['go', 'building', 'ready', 'applied', 'replied'].includes(j.pipeline_stage)
  ).length

  return (
    <div className="-mx-6 -my-8">
      {/* Header */}
      <div className="px-6 py-5 border-b border-zinc-800">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-white">Pipeline</h1>
            <p className="text-sm text-zinc-500 mt-0.5">
              {totalActive} active deal{totalActive !== 1 ? 's' : ''} in pipeline
            </p>
          </div>
          <button
            onClick={() => fetchJobs()}
            className="flex items-center gap-2 rounded-lg bg-zinc-800 px-3 py-1.5 text-xs text-zinc-300 transition hover:bg-zinc-700 hover:text-white"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182"
              />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      {/* Board */}
      <div className="overflow-x-auto px-6 py-5">
        <div className="flex gap-4" style={{ minWidth: `${COLUMNS.length * 296}px` }}>
          {COLUMNS.map((col) => {
            const items = columnJobs[col.stage] || []
            return (
              <div
                key={col.stage}
                className="min-w-[280px] flex-1 rounded-lg bg-zinc-900/50 p-3"
                style={{ minHeight: '400px' }}
              >
                {/* Column header */}
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h2
                      className={`text-sm font-semibold ${getColumnHeaderColor(col.stage)}`}
                    >
                      {col.label}
                    </h2>
                    <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-zinc-800 px-1.5 text-[11px] font-medium text-zinc-400">
                      {items.length}
                    </span>
                  </div>
                </div>

                {col.description && (
                  <p className="mb-3 text-[11px] text-zinc-600">{col.description}</p>
                )}

                {/* Cards */}
                <div className="space-y-2 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 220px)' }}>
                  {items.length === 0 && (
                    <div className="flex items-center justify-center rounded-lg border border-dashed border-zinc-800 py-8">
                      <span className="text-xs text-zinc-600">No deals</span>
                    </div>
                  )}
                  {items.map((job) => (
                    <KanbanCard
                      key={job.id}
                      job={job}
                      onClick={() => openPanel(job)}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Slide-over panel overlay */}
      {selectedJob && (
        <div
          className="fixed inset-0 z-30 flex justify-end"
          onClick={(e) => {
            if (e.target === e.currentTarget) closePanel()
          }}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50" onClick={closePanel} />

          {/* Panel */}
          <SlideOverPanel
            job={selectedJob}
            history={history}
            historyLoading={historyLoading}
            panelLoomLink={panelLoomLink}
            setPanelLoomLink={(v) => {
              setPanelLoomLink(v)
              setDirtyFields((prev) => new Set(prev).add('loom_link'))
            }}
            panelDemoUrl={panelDemoUrl}
            setPanelDemoUrl={(v) => {
              setPanelDemoUrl(v)
              setDirtyFields((prev) => new Set(prev).add('demo_url'))
            }}
            panelNotes={panelNotes}
            setPanelNotes={(v) => {
              setPanelNotes(v)
              setDirtyFields((prev) => new Set(prev).add('notes'))
            }}
            panelStage={panelStage}
            setPanelStage={setPanelStage}
            dirtyFields={dirtyFields}
            saving={saving}
            onClose={closePanel}
            onPatchField={patchField}
            onChangeStage={changeStage}
            onSaveAll={saveAllFields}
          />
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// KanbanCard Component
// ---------------------------------------------------------------------------

function KanbanCard({ job, onClick }: { job: Job; onClick: () => void }) {
  const score = job.deep_vet_score ?? job.ai_score
  const originalVerdict = job.deep_vet_verdict ?? job.ai_verdict
  const effectiveVerdict = job.verdict_override ?? originalVerdict
  const hasOverride = job.verdict_override != null && job.verdict_override !== originalVerdict

  return (
    <button
      onClick={onClick}
      className="w-full rounded-lg border border-zinc-800 bg-zinc-900 p-3 text-left transition hover:border-zinc-700 hover:bg-zinc-800/80 cursor-pointer"
    >
      {/* Title */}
      <p className="text-sm font-medium text-white truncate">{job.title}</p>

      {/* Budget */}
      {job.budget_display && (
        <p className="mt-1 text-xs text-zinc-400 truncate">{job.budget_display}</p>
      )}

      {/* Badges row */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {/* AI Score badge */}
        {score != null && (
          <span
            className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium ${getScoreColor(score)}`}
          >
            {score.toFixed(1)}
          </span>
        )}

        {/* Verdict badge with override */}
        {effectiveVerdict && (
          <span
            className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium ${getVerdictColor(effectiveVerdict)}`}
          >
            {hasOverride ? (
              <>
                <span className="opacity-50 line-through">{originalVerdict === 'GO' ? 'Go' : originalVerdict === 'NEEDS_REVIEW' ? 'Review' : 'No-Go'}</span>
                <span className="text-zinc-500">→</span>
                <span>{effectiveVerdict === 'GO' ? 'Go' : effectiveVerdict === 'NEEDS_REVIEW' ? 'Review' : 'No-Go'}</span>
              </>
            ) : (
              <>{effectiveVerdict === 'GO' ? 'Go' : effectiveVerdict === 'NEEDS_REVIEW' ? 'Review' : 'No-Go'}</>
            )}
          </span>
        )}

        {/* Build type badge */}
        {job.build_type && (
          <span className="inline-flex items-center rounded bg-zinc-800 px-1.5 py-0.5 text-[11px] text-zinc-300">
            {job.build_type === 'build' ? 'Build Demo' : 'Loom Only'}
          </span>
        )}
      </div>

      {/* Meta row */}
      <div className="mt-2 flex items-center justify-between">
        <span className="text-[11px] text-zinc-500">{getDaysInStage(job)}</span>
        <span className="text-[11px] text-zinc-600">{formatDate(job.created_at)}</span>
      </div>
    </button>
  )
}

// ---------------------------------------------------------------------------
// SlideOverPanel Component
// ---------------------------------------------------------------------------

interface SlideOverPanelProps {
  job: Job
  history: HistoryEntry[]
  historyLoading: boolean
  panelLoomLink: string
  setPanelLoomLink: (v: string) => void
  panelDemoUrl: string
  setPanelDemoUrl: (v: string) => void
  panelNotes: string
  setPanelNotes: (v: string) => void
  panelStage: PipelineStage | string
  setPanelStage: (v: PipelineStage | string) => void
  dirtyFields: Set<string>
  saving: boolean
  onClose: () => void
  onPatchField: (jobId: string, field: string, value: string) => Promise<void>
  onChangeStage: (jobId: string, newStage: PipelineStage) => Promise<void>
  onSaveAll: () => Promise<void>
}

function SlideOverPanel({
  job,
  history,
  historyLoading,
  panelLoomLink,
  setPanelLoomLink,
  panelDemoUrl,
  setPanelDemoUrl,
  panelNotes,
  setPanelNotes,
  panelStage,
  setPanelStage,
  dirtyFields,
  saving,
  onClose,
  onPatchField,
  onChangeStage,
  onSaveAll,
}: SlideOverPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [showVerdictMenu, setShowVerdictMenu] = useState(false)
  const score = job.deep_vet_score ?? job.ai_score
  const originalVerdict = job.deep_vet_verdict ?? job.ai_verdict
  const effectiveVerdict = job.verdict_override ?? originalVerdict
  const hasOverride = job.verdict_override != null && job.verdict_override !== originalVerdict
  const reasoning = job.deep_vet_reasoning ?? job.ai_reasoning

  return (
    <div
      ref={panelRef}
      className="slide-in relative z-10 flex h-full w-full max-w-2xl flex-col border-l border-zinc-800 bg-zinc-950 shadow-2xl"
    >
      {/* Panel header */}
      <div className="flex items-start justify-between border-b border-zinc-800 px-6 py-4">
        <div className="min-w-0 flex-1 pr-4">
          <h2 className="text-lg font-semibold text-white leading-tight">
            {job.title}
          </h2>
          {job.upwork_link && (
            <a
              href={job.upwork_link}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition"
            >
              Open on Upwork
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
              </svg>
            </a>
          )}
        </div>
        <button
          onClick={onClose}
          className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-zinc-800 hover:text-white"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        <div className="space-y-6 px-6 py-5">
          {/* Budget & Client info */}
          <div className="grid grid-cols-2 gap-3">
            <InfoCard label="Budget" value={job.budget_display || '--'} />
            <InfoCard label="Budget Type" value={job.budget_type || '--'} />
            <InfoCard label="Client Location" value={job.client_location || '--'} />
            <InfoCard label="Client Spend" value={job.client_spend || '--'} />
            <InfoCard label="Client Rating" value={job.client_rating || '--'} />
            <InfoCard label="Proposals" value={job.proposals_count || '--'} />
          </div>

          {/* Skills */}
          {job.skills && job.skills.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
                Skills
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {job.skills.map((skill) => (
                  <span
                    key={skill}
                    className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* AI Analysis */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
            <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-zinc-500">
              AI Analysis
            </h3>
            <div className="space-y-3">
              {/* Score + Verdict row */}
              <div className="flex items-center gap-3">
                {score != null && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-500">Score:</span>
                    <span
                      className={`inline-flex items-center rounded px-2 py-0.5 text-sm font-semibold ${getScoreColor(score)}`}
                    >
                      {score.toFixed(1)}
                    </span>
                  </div>
                )}
                {originalVerdict && (
                  <div className="relative flex items-center gap-2">
                    <span className="text-xs text-zinc-500">Verdict:</span>
                    <button
                      onClick={() => setShowVerdictMenu(!showVerdictMenu)}
                      className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs font-medium transition hover:ring-1 hover:ring-zinc-600 ${getVerdictColor(effectiveVerdict)}`}
                    >
                      {hasOverride ? (
                        <>
                          <span className="opacity-50 line-through">{originalVerdict}</span>
                          <span className="text-zinc-500">→</span>
                          <span>{effectiveVerdict}</span>
                        </>
                      ) : (
                        effectiveVerdict
                      )}
                    </button>
                    {showVerdictMenu && (
                      <div className="absolute left-0 top-full z-30 mt-1 w-44 rounded-lg border border-zinc-700 bg-zinc-800 py-1 shadow-xl">
                        {(['GO', 'NEEDS_REVIEW', 'NO-GO'] as const).map((v) => (
                          <button
                            key={v}
                            onClick={() => {
                              // Store NULL if same as original (no real override)
                              const val = v === originalVerdict ? '' : v
                              onPatchField(job.id, 'verdict_override', val)
                              setShowVerdictMenu(false)
                            }}
                            className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition hover:bg-zinc-700 ${
                              effectiveVerdict === v ? 'bg-zinc-700/50' : ''
                            }`}
                          >
                            <span className={`inline-block h-2 w-2 rounded-full ${
                              v === 'GO' ? 'bg-emerald-400' : v === 'NEEDS_REVIEW' ? 'bg-amber-400' : 'bg-red-400'
                            }`} />
                            <span className={getVerdictColor(v).split(' ')[0]}>
                              {v === 'GO' ? 'Go' : v === 'NEEDS_REVIEW' ? 'Review' : 'No-Go'}
                            </span>
                            {effectiveVerdict === v && <span className="ml-auto text-zinc-500">✓</span>}
                          </button>
                        ))}
                        {hasOverride && (
                          <>
                            <div className="my-1 border-t border-zinc-700" />
                            <button
                              onClick={() => {
                                onPatchField(job.id, 'verdict_override', '')
                                setShowVerdictMenu(false)
                              }}
                              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-zinc-400 transition hover:bg-zinc-700"
                            >
                              Reset to AI verdict
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}
                {job.ai_estimated_effort && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-500">Effort:</span>
                    <span className="text-xs text-zinc-300">{job.ai_estimated_effort}</span>
                  </div>
                )}
              </div>

              {/* Reasoning */}
              {reasoning && (
                <div>
                  <span className="text-xs font-medium text-zinc-400">Reasoning</span>
                  <p className="mt-1 text-sm text-zinc-300 leading-relaxed">
                    {reasoning}
                  </p>
                </div>
              )}

              {/* Approach */}
              {job.deep_vet_approach && (
                <div>
                  <span className="text-xs font-medium text-zinc-400">Approach</span>
                  <p className="mt-1 text-sm text-zinc-300 leading-relaxed">
                    {job.deep_vet_approach}
                  </p>
                </div>
              )}

              {/* Risks */}
              {job.deep_vet_risks && (
                <div>
                  <span className="text-xs font-medium text-zinc-400">Risks</span>
                  <p className="mt-1 text-sm text-zinc-300 leading-relaxed">
                    {job.deep_vet_risks}
                  </p>
                </div>
              )}

              {/* Opportunities */}
              {job.deep_vet_opportunities && (
                <div>
                  <span className="text-xs font-medium text-zinc-400">Opportunities</span>
                  <p className="mt-1 text-sm text-zinc-300 leading-relaxed">
                    {job.deep_vet_opportunities}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Copyable Code Blocks */}
          {job.claude_code_prompt && (
            <CopyableBlock
              label="Claude Code Prompt"
              content={job.claude_code_prompt}
            />
          )}

          {job.loom_script && (
            <CopyableBlock label="Loom Script" content={job.loom_script} />
          )}

          {job.proposal_text && (
            <CopyableBlock label="Proposal Text" content={job.proposal_text} />
          )}

          {/* Editable Fields */}
          <div className="space-y-4">
            <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Details
            </h3>

            {/* Pipeline Stage */}
            <div>
              <label className="mb-1 block text-xs text-zinc-500">
                Pipeline Stage
              </label>
              <select
                value={panelStage}
                onChange={(e) => {
                  const newStage = e.target.value as PipelineStage
                  setPanelStage(newStage)
                  onChangeStage(job.id, newStage)
                }}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white outline-none transition focus:border-zinc-600"
              >
                {ALL_STAGES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Loom/Tella Link */}
            <div>
              <label className="mb-1 flex items-center gap-2 text-xs text-zinc-500">
                Loom / Tella Link
                {dirtyFields.has('loom_link') && (
                  <span className="text-[10px] text-amber-400">unsaved</span>
                )}
              </label>
              <input
                type="url"
                value={panelLoomLink}
                onChange={(e) => setPanelLoomLink(e.target.value)}
                onBlur={() => onPatchField(job.id, 'loom_link', panelLoomLink)}
                placeholder="https://www.loom.com/share/..."
                className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none transition focus:border-zinc-600"
              />
            </div>

            {/* Demo URL */}
            <div>
              <label className="mb-1 flex items-center gap-2 text-xs text-zinc-500">
                Demo URL
                {dirtyFields.has('demo_url') && (
                  <span className="text-[10px] text-amber-400">unsaved</span>
                )}
              </label>
              <input
                type="url"
                value={panelDemoUrl}
                onChange={(e) => setPanelDemoUrl(e.target.value)}
                onBlur={() => onPatchField(job.id, 'demo_url', panelDemoUrl)}
                placeholder="https://demo.example.com"
                className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none transition focus:border-zinc-600"
              />
            </div>

            {/* Notes */}
            <div>
              <label className="mb-1 flex items-center gap-2 text-xs text-zinc-500">
                Notes
                {dirtyFields.has('notes') && (
                  <span className="text-[10px] text-amber-400">unsaved</span>
                )}
              </label>
              <textarea
                value={panelNotes}
                onChange={(e) => setPanelNotes(e.target.value)}
                onBlur={() => onPatchField(job.id, 'notes', panelNotes)}
                placeholder="Add notes..."
                rows={3}
                className="w-full resize-none rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none transition focus:border-zinc-600"
              />
            </div>
          </div>

          {/* History Timeline */}
          <div>
            <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-zinc-500">
              History
            </h3>
            {historyLoading ? (
              <p className="text-xs text-zinc-600">Loading history...</p>
            ) : history.length === 0 ? (
              <p className="text-xs text-zinc-600">No history yet.</p>
            ) : (
              <div className="relative space-y-0">
                {history.map((entry, idx) => (
                  <div key={entry.id} className="relative flex gap-3 pb-4">
                    {/* Dot + Line */}
                    <div className="relative flex flex-col items-center">
                      <div className="mt-1 h-2 w-2 rounded-full bg-zinc-600 ring-2 ring-zinc-900" />
                      {idx < history.length - 1 && (
                        <div className="mt-0.5 w-px flex-1 bg-zinc-800" />
                      )}
                    </div>
                    {/* Content */}
                    <div className="min-w-0 flex-1 pb-1">
                      <p className="text-sm text-zinc-300 leading-snug">
                        {entry.details || entry.action}
                      </p>
                      <p className="mt-0.5 text-[11px] text-zinc-600">
                        {formatRelativeTime(entry.created_at)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Panel footer: Save button */}
      <div className="border-t border-zinc-800 px-6 py-3">
        <button
          onClick={onSaveAll}
          disabled={saving || dirtyFields.size === 0}
          className={`w-full rounded-lg px-4 py-2 text-sm font-medium transition ${
            saving || dirtyFields.size === 0
              ? 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
              : 'bg-white text-zinc-950 hover:bg-zinc-200'
          }`}
        >
          {saving ? 'Saving...' : dirtyFields.size > 0 ? 'Save Changes' : 'All Saved'}
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// InfoCard sub-component
// ---------------------------------------------------------------------------

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2">
      <span className="block text-[11px] text-zinc-600">{label}</span>
      <span className="block text-sm text-zinc-300 truncate">{value}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// CopyableBlock sub-component
// ---------------------------------------------------------------------------

function CopyableBlock({ label, content }: { label: string; content: string }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          {label}
        </h3>
        <CopyButton text={content} label="Copy" />
      </div>
      <pre className="max-h-48 overflow-auto rounded-lg border border-zinc-800 bg-zinc-900/80 p-3 text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap">
        {content}
      </pre>
    </div>
  )
}
