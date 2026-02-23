'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useToast } from '../components/toast'

// ─── Upwork Category Tree ───────────────────────────────────────────
const CATEGORIES: Record<string, string[]> = {
  'Accounting & Consulting': [
    'Personal & Professional Coaching',
    'Accounting & Bookkeeping',
    'Financial Planning',
    'Recruiting & Human Resources',
    'Management Consulting & Analysis',
    'Other - Accounting & Consulting',
  ],
  'Admin Support': [
    'Data Entry & Transcription Services',
    'Virtual Assistance',
    'Project Management',
    'Market Research & Product Reviews',
  ],
  'Customer Service': [
    'Community Management & Tagging',
    'Customer Service & Tech Support',
  ],
  'Data Science & Analytics': [
    'Data Analysis & Testing',
    'Data Extraction/ETL',
    'Data Mining & Management',
    'AI & Machine Learning',
  ],
  'Design & Creative': [
    'Art & Illustration',
    'Audio & Music Production',
    'Branding & Logo Design',
    'NFT, AR/VR & Game Art',
    'Graphic, Editorial & Presentation Design',
    'Performing Arts',
    'Photography',
    'Product Design',
    'Video & Animation',
  ],
  'Engineering & Architecture': [
    'Building & Landscape Architecture',
    'Chemical Engineering',
    'Civil & Structural Engineering',
    'Contract Manufacturing',
    'Electrical & Electronic Engineering',
    'Interior & Trade Show Design',
    'Energy & Mechanical Engineering',
    'Physical Sciences',
    '3D Modeling & CAD',
  ],
  'IT & Networking': [
    'Database Management & Administration',
    'ERP/CRM Software',
    'Information Security & Compliance',
    'Network & System Administration',
    'DevOps & Solution Architecture',
  ],
  'Legal': [
    'Corporate & Contract Law',
    'International & Immigration Law',
    'Finance & Tax Law',
    'Public Law',
  ],
  'Sales & Marketing': [
    'Digital Marketing',
    'Lead Generation & Telemarketing',
    'Marketing, PR & Brand Strategy',
  ],
  'Translation': [
    'Language Tutoring & Interpretation',
    'Translation & Localization Services',
  ],
  'Web, Mobile & Software Dev': [
    'Blockchain, NFT & Cryptocurrency',
    'AI Apps & Integration',
    'Desktop Application Development',
    'Ecommerce Development',
    'Game Design & Development',
    'Mobile Development',
    'Other - Software Development',
    'Product Management & Scrum',
    'QA Testing',
    'Scripts & Utilities',
    'Web & Mobile Design',
    'Web Development',
  ],
  'Writing': [
    'Sales & Marketing Copywriting',
    'Content Writing',
    'Editing & Proofreading Services',
    'Professional & Business Writing',
  ],
}

// ─── Filter Types ───────────────────────────────────────────────────
interface UpworkFilters {
  categories: string[]
  experience_level: string[]
  job_type: {
    hourly: boolean
    hourly_min: string
    hourly_max: string
    fixed: boolean
    fixed_ranges: string[]
    fixed_min: string
    fixed_max: string
  }
  proposals: string[]
  client_info: string[]
  client_history: string[]
  project_length: string[]
  hours_per_week: string[]
  job_duration: string[]
}

const DEFAULT_FILTERS: UpworkFilters = {
  categories: [],
  experience_level: [],
  job_type: {
    hourly: false,
    hourly_min: '',
    hourly_max: '',
    fixed: false,
    fixed_ranges: [],
    fixed_min: '',
    fixed_max: '',
  },
  proposals: [],
  client_info: [],
  client_history: [],
  project_length: [],
  hours_per_week: [],
  job_duration: [],
}

function parseFilters(raw: Record<string, unknown>): UpworkFilters {
  if (!raw || Object.keys(raw).length === 0) return { ...DEFAULT_FILTERS, job_type: { ...DEFAULT_FILTERS.job_type } }
  try {
    return {
      categories: (raw.categories as string[]) || [],
      experience_level: (raw.experience_level as string[]) || [],
      job_type: raw.job_type
        ? {
            hourly: (raw.job_type as Record<string, unknown>).hourly as boolean || false,
            hourly_min: ((raw.job_type as Record<string, unknown>).hourly_min as string) || '',
            hourly_max: ((raw.job_type as Record<string, unknown>).hourly_max as string) || '',
            fixed: (raw.job_type as Record<string, unknown>).fixed as boolean || false,
            fixed_ranges: ((raw.job_type as Record<string, unknown>).fixed_ranges as string[]) || [],
            fixed_min: ((raw.job_type as Record<string, unknown>).fixed_min as string) || '',
            fixed_max: ((raw.job_type as Record<string, unknown>).fixed_max as string) || '',
          }
        : { ...DEFAULT_FILTERS.job_type },
      proposals: (raw.proposals as string[]) || [],
      client_info: (raw.client_info as string[]) || [],
      client_history: (raw.client_history as string[]) || [],
      project_length: (raw.project_length as string[]) || [],
      hours_per_week: (raw.hours_per_week as string[]) || [],
      job_duration: (raw.job_duration as string[]) || [],
    }
  } catch {
    return { ...DEFAULT_FILTERS, job_type: { ...DEFAULT_FILTERS.job_type } }
  }
}

function countActiveFilters(f: UpworkFilters): number {
  let c = 0
  c += f.categories.length
  c += f.experience_level.length
  if (f.job_type.hourly) c++
  if (f.job_type.fixed) c++
  c += f.job_type.fixed_ranges.length
  c += f.proposals.length
  c += f.client_info.length
  c += f.client_history.length
  c += f.project_length.length
  c += f.hours_per_week.length
  c += f.job_duration.length
  return c
}

function summarizeFilters(f: UpworkFilters): string {
  const parts: string[] = []
  if (f.categories.length) parts.push(`${f.categories.length} categor${f.categories.length === 1 ? 'y' : 'ies'}`)
  if (f.experience_level.length) parts.push(f.experience_level.join(', '))
  if (f.job_type.hourly) {
    let s = 'Hourly'
    if (f.job_type.hourly_min || f.job_type.hourly_max) {
      s += ` ($${f.job_type.hourly_min || '0'}–$${f.job_type.hourly_max || '∞'}/hr)`
    }
    parts.push(s)
  }
  if (f.job_type.fixed) {
    const fp = [...f.job_type.fixed_ranges]
    if (f.job_type.fixed_min || f.job_type.fixed_max) {
      fp.push(`$${f.job_type.fixed_min || '0'}–$${f.job_type.fixed_max || '∞'}`)
    }
    parts.push(`Fixed${fp.length ? ': ' + fp.join(', ') : ''}`)
  }
  if (f.proposals.length) parts.push(`Proposals: ${f.proposals.join(', ')}`)
  if (f.client_info.length) parts.push(f.client_info.join(', '))
  if (f.client_history.length) parts.push(`History: ${f.client_history.join(', ')}`)
  if (f.project_length.length) parts.push(`Length: ${f.project_length.join(', ')}`)
  if (f.hours_per_week.length) parts.push(f.hours_per_week.join(', '))
  if (f.job_duration.length) parts.push(f.job_duration.join(', '))
  return parts.length ? parts.join(' · ') : 'No filters set'
}

// ─── Reusable filter section components ─────────────────────────────

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`h-4 w-4 text-zinc-500 transition-transform duration-200 ${open ? '' : '-rotate-90'}`}
      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  )
}

function FilterSection({
  title,
  defaultOpen = true,
  children,
}: {
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-b border-zinc-800/60 py-4 last:border-b-0">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="text-sm font-medium text-zinc-300">{title}</span>
        <ChevronIcon open={open} />
      </button>
      {open && <div className="mt-3 space-y-2">{children}</div>}
    </div>
  )
}

function CheckboxItem({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 py-0.5 group">
      <div className="relative flex items-center justify-center">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="peer sr-only"
        />
        <div className={`h-4 w-4 rounded border transition-colors ${
          checked
            ? 'border-emerald-500 bg-emerald-500'
            : 'border-zinc-600 bg-zinc-800 group-hover:border-zinc-500'
        }`}>
          {checked && (
            <svg className="h-4 w-4 text-white" viewBox="0 0 16 16" fill="none">
              <path d="M4 8l3 3 5-6" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </div>
      </div>
      <span className="text-sm text-zinc-400 group-hover:text-zinc-300 select-none">{label}</span>
    </label>
  )
}

function MinMaxInput({
  minVal,
  maxVal,
  onMinChange,
  onMaxChange,
  prefix = '$',
  suffix = '',
}: {
  minVal: string
  maxVal: string
  onMinChange: (v: string) => void
  onMaxChange: (v: string) => void
  prefix?: string
  suffix?: string
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="relative flex-1">
        {prefix && (
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-zinc-500">{prefix}</span>
        )}
        <input
          type="text"
          inputMode="numeric"
          value={minVal}
          onChange={(e) => onMinChange(e.target.value.replace(/[^0-9]/g, ''))}
          placeholder="Min"
          className={`w-full rounded-md border border-zinc-700 bg-zinc-800 py-1.5 text-xs text-zinc-300 placeholder-zinc-600 outline-none transition focus:border-zinc-500 ${prefix ? 'pl-6 pr-2' : 'px-2.5'}`}
        />
      </div>
      {suffix && <span className="text-xs text-zinc-500 shrink-0">{suffix}</span>}
      <div className="relative flex-1">
        {prefix && (
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-zinc-500">{prefix}</span>
        )}
        <input
          type="text"
          inputMode="numeric"
          value={maxVal}
          onChange={(e) => onMaxChange(e.target.value.replace(/[^0-9]/g, ''))}
          placeholder="Max"
          className={`w-full rounded-md border border-zinc-700 bg-zinc-800 py-1.5 text-xs text-zinc-300 placeholder-zinc-600 outline-none transition focus:border-zinc-500 ${prefix ? 'pl-6 pr-2' : 'px-2.5'}`}
        />
      </div>
      {suffix && <span className="text-xs text-zinc-500 shrink-0">{suffix}</span>}
    </div>
  )
}

// ─── Category Dropdown ──────────────────────────────────────────────
function CategorySelect({
  selected,
  onChange,
}: {
  selected: string[]
  onChange: (cats: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function toggleGroup(group: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(group)) next.delete(group)
      else next.add(group)
      return next
    })
  }

  function toggleCategory(cat: string) {
    if (selected.includes(cat)) {
      onChange(selected.filter((c) => c !== cat))
    } else {
      onChange([...selected, cat])
    }
  }

  function toggleAllInGroup(group: string) {
    const subs = CATEGORIES[group]
    const allKey = `All - ${group}`
    const groupItems = [allKey, ...subs]
    const allSelected = groupItems.every((c) => selected.includes(c))
    if (allSelected) {
      onChange(selected.filter((c) => !groupItems.includes(c)))
    } else {
      const newSet = new Set([...selected, ...groupItems])
      onChange(Array.from(newSet))
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-left text-sm transition hover:border-zinc-600"
      >
        <span className={selected.length ? 'text-zinc-300' : 'text-zinc-500'}>
          {selected.length ? `${selected.length} selected` : 'Select Categories'}
        </span>
        <svg className={`h-4 w-4 text-zinc-500 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 right-0 z-50 mt-1 max-h-72 overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl shadow-black/40">
          {Object.entries(CATEGORIES).map(([group, subs]) => {
            const expanded = expandedGroups.has(group)
            const allKey = `All - ${group}`
            const groupItems = [allKey, ...subs]
            const selectedCount = groupItems.filter((c) => selected.includes(c)).length

            return (
              <div key={group} className="border-b border-zinc-800/50 last:border-b-0">
                <div className="flex items-center gap-1 px-3 py-2 hover:bg-zinc-800/50">
                  <button onClick={() => toggleGroup(group)} className="mr-1 shrink-0">
                    <svg
                      className={`h-3 w-3 text-zinc-500 transition-transform ${expanded ? 'rotate-90' : ''}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                  <label className="flex flex-1 cursor-pointer items-center gap-2">
                    <div className={`h-3.5 w-3.5 rounded border transition-colors ${
                      selectedCount === groupItems.length
                        ? 'border-emerald-500 bg-emerald-500'
                        : selectedCount > 0
                        ? 'border-emerald-500/50 bg-emerald-500/30'
                        : 'border-zinc-600 bg-zinc-800'
                    }`}
                      onClick={(e) => { e.preventDefault(); toggleAllInGroup(group) }}
                    >
                      {selectedCount === groupItems.length && (
                        <svg className="h-3.5 w-3.5 text-white" viewBox="0 0 16 16" fill="none">
                          <path d="M4 8l3 3 5-6" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                      {selectedCount > 0 && selectedCount < groupItems.length && (
                        <svg className="h-3.5 w-3.5 text-white" viewBox="0 0 16 16" fill="none">
                          <path d="M4 8h8" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
                        </svg>
                      )}
                    </div>
                    <span className="text-sm font-medium text-zinc-300" onClick={() => toggleGroup(group)}>{group}</span>
                  </label>
                  {selectedCount > 0 && (
                    <span className="text-xs text-zinc-500">{selectedCount}</span>
                  )}
                </div>

                {expanded && (
                  <div className="pb-1 pl-9">
                    {subs.map((sub) => (
                      <label
                        key={sub}
                        className="flex cursor-pointer items-center gap-2 px-3 py-1.5 hover:bg-zinc-800/30"
                      >
                        <div
                          className={`h-3.5 w-3.5 rounded border transition-colors ${
                            selected.includes(sub) ? 'border-emerald-500 bg-emerald-500' : 'border-zinc-600 bg-zinc-800'
                          }`}
                          onClick={(e) => { e.preventDefault(); toggleCategory(sub) }}
                        >
                          {selected.includes(sub) && (
                            <svg className="h-3.5 w-3.5 text-white" viewBox="0 0 16 16" fill="none">
                              <path d="M4 8l3 3 5-6" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </div>
                        <span className="text-xs text-zinc-400" onClick={() => toggleCategory(sub)}>{sub}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Filter Panel (full Upwork filter set) ──────────────────────────
function FilterPanel({
  filters,
  onChange,
}: {
  filters: UpworkFilters
  onChange: (f: UpworkFilters) => void
}) {
  function toggleInArray(arr: string[], val: string): string[] {
    return arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val]
  }

  function updateJobType(patch: Partial<UpworkFilters['job_type']>) {
    onChange({ ...filters, job_type: { ...filters.job_type, ...patch } })
  }

  return (
    <div className="space-y-0">
      {/* Category */}
      <FilterSection title="Category">
        <CategorySelect
          selected={filters.categories}
          onChange={(cats) => onChange({ ...filters, categories: cats })}
        />
      </FilterSection>

      {/* Experience Level */}
      <FilterSection title="Experience level">
        {['Entry Level', 'Intermediate', 'Expert'].map((lvl) => (
          <CheckboxItem
            key={lvl}
            label={lvl}
            checked={filters.experience_level.includes(lvl)}
            onChange={() => onChange({ ...filters, experience_level: toggleInArray(filters.experience_level, lvl) })}
          />
        ))}
      </FilterSection>

      {/* Job Type */}
      <FilterSection title="Job type">
        {/* Hourly */}
        <CheckboxItem
          label="Hourly"
          checked={filters.job_type.hourly}
          onChange={(c) => updateJobType({ hourly: c })}
        />
        {filters.job_type.hourly && (
          <div className="ml-6 mt-1">
            <MinMaxInput
              minVal={filters.job_type.hourly_min}
              maxVal={filters.job_type.hourly_max}
              onMinChange={(v) => updateJobType({ hourly_min: v })}
              onMaxChange={(v) => updateJobType({ hourly_max: v })}
              prefix="$"
              suffix="/hr"
            />
          </div>
        )}

        {/* Fixed-Price */}
        <div className="mt-1">
          <CheckboxItem
            label="Fixed-Price"
            checked={filters.job_type.fixed}
            onChange={(c) => updateJobType({ fixed: c })}
          />
        </div>
        {filters.job_type.fixed && (
          <div className="ml-6 mt-1 space-y-1.5">
            {['Less than $100', '$100 to $500', '$500 - $1K', '$1K - $5K', '$5K+'].map((range) => (
              <CheckboxItem
                key={range}
                label={range}
                checked={filters.job_type.fixed_ranges.includes(range)}
                onChange={() => updateJobType({ fixed_ranges: toggleInArray(filters.job_type.fixed_ranges, range) })}
              />
            ))}
            <div className="mt-2">
              <MinMaxInput
                minVal={filters.job_type.fixed_min}
                maxVal={filters.job_type.fixed_max}
                onMinChange={(v) => updateJobType({ fixed_min: v })}
                onMaxChange={(v) => updateJobType({ fixed_max: v })}
                prefix="$"
              />
            </div>
          </div>
        )}
      </FilterSection>

      {/* Number of proposals */}
      <FilterSection title="Number of proposals">
        {['Less than 5', '5 to 10', '10 to 15', '15 to 20', '20 to 50'].map((opt) => (
          <CheckboxItem
            key={opt}
            label={opt}
            checked={filters.proposals.includes(opt)}
            onChange={() => onChange({ ...filters, proposals: toggleInArray(filters.proposals, opt) })}
          />
        ))}
      </FilterSection>

      {/* Client info */}
      <FilterSection title="Client info">
        {['Payment verified'].map((opt) => (
          <CheckboxItem
            key={opt}
            label={opt}
            checked={filters.client_info.includes(opt)}
            onChange={() => onChange({ ...filters, client_info: toggleInArray(filters.client_info, opt) })}
          />
        ))}
      </FilterSection>

      {/* Client history */}
      <FilterSection title="Client history">
        {['No hires', '1 to 9 hires', '10+ hires'].map((opt) => (
          <CheckboxItem
            key={opt}
            label={opt}
            checked={filters.client_history.includes(opt)}
            onChange={() => onChange({ ...filters, client_history: toggleInArray(filters.client_history, opt) })}
          />
        ))}
      </FilterSection>

      {/* Project length */}
      <FilterSection title="Project length">
        {['Less than one month', '1 to 3 months', '3 to 6 months', 'More than 6 months'].map((opt) => (
          <CheckboxItem
            key={opt}
            label={opt}
            checked={filters.project_length.includes(opt)}
            onChange={() => onChange({ ...filters, project_length: toggleInArray(filters.project_length, opt) })}
          />
        ))}
      </FilterSection>

      {/* Hours per week */}
      <FilterSection title="Hours per week">
        {['Less than 30 hrs/week', 'More than 30 hrs/week'].map((opt) => (
          <CheckboxItem
            key={opt}
            label={opt}
            checked={filters.hours_per_week.includes(opt)}
            onChange={() => onChange({ ...filters, hours_per_week: toggleInArray(filters.hours_per_week, opt) })}
          />
        ))}
      </FilterSection>

      {/* Job duration */}
      <FilterSection title="Job duration">
        <CheckboxItem
          label="Contract-to-hire roles"
          checked={filters.job_duration.includes('Contract-to-hire')}
          onChange={() => onChange({ ...filters, job_duration: toggleInArray(filters.job_duration, 'Contract-to-hire') })}
        />
      </FilterSection>
    </div>
  )
}


// ─── Saved Search Interface ─────────────────────────────────────────
interface SavedSearch {
  id: string
  name: string
  search_query: string | null
  filters: Record<string, unknown>
  notes: string | null
  total_jobs_found: number
  total_go: number
  total_no_go: number
  is_active: boolean
  created_at: string
  updated_at: string
}

// ─── Main Page ──────────────────────────────────────────────────────
export default function SavedSearchesPage() {
  const { toast } = useToast()
  const [searches, setSearches] = useState<SavedSearch[]>([])
  const [loading, setLoading] = useState(true)

  // Create mode
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newQuery, setNewQuery] = useState('')
  const [newNotes, setNewNotes] = useState('')
  const [newFilters, setNewFilters] = useState<UpworkFilters>(() => ({
    ...DEFAULT_FILTERS,
    job_type: { ...DEFAULT_FILTERS.job_type },
  }))

  // Edit filter panel (slide-over for existing search)
  const [editingFiltersId, setEditingFiltersId] = useState<string | null>(null)
  const [editFilters, setEditFilters] = useState<UpworkFilters>(() => ({
    ...DEFAULT_FILTERS,
    job_type: { ...DEFAULT_FILTERS.job_type },
  }))

  // Inline editing for name/query/notes
  const [editing, setEditing] = useState<{ id: string; field: 'name' | 'search_query' | 'notes' } | null>(null)
  const [editValue, setEditValue] = useState('')
  const editInputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)
  const newNameInputRef = useRef<HTMLInputElement>(null)

  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)

  const fetchSearches = useCallback(async () => {
    try {
      const res = await fetch('/api/saved-searches')
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json()
      setSearches(data)
    } catch {
      toast('Failed to load saved searches', 'error')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    fetchSearches()
  }, [fetchSearches])

  useEffect(() => {
    if (editing && editInputRef.current) editInputRef.current.focus()
  }, [editing])

  useEffect(() => {
    if (creating && newNameInputRef.current) newNameInputRef.current.focus()
  }, [creating])

  // ─── CRUD ──────────────────────────────────────────────────────
  async function handleCreate() {
    const trimmed = newName.trim()
    if (!trimmed) {
      toast('Name is required', 'error')
      return
    }

    try {
      const res = await fetch('/api/saved-searches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmed,
          search_query: newQuery,
          filters: newFilters,
          notes: newNotes,
          is_active: true,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to create')
      }

      const created = await res.json()
      setSearches((prev) => [created, ...prev])
      setNewName('')
      setNewQuery('')
      setNewNotes('')
      setNewFilters({ ...DEFAULT_FILTERS, job_type: { ...DEFAULT_FILTERS.job_type } })
      setCreating(false)
      toast('Search created', 'success')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to create search', 'error')
    }
  }

  function startEdit(search: SavedSearch, field: 'name' | 'search_query' | 'notes') {
    setEditing({ id: search.id, field })
    setEditValue((search[field] as string) ?? '')
  }

  async function saveEdit() {
    if (!editing) return
    const { id, field } = editing
    const payload: Record<string, unknown> = { id }

    if (field === 'name') {
      const trimmed = editValue.trim()
      if (!trimmed) {
        toast('Name cannot be empty', 'error')
        return
      }
      payload[field] = trimmed
    } else {
      payload[field] = editValue
    }

    setSavingId(id)
    try {
      const res = await fetch('/api/saved-searches', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to update')
      }
      const updated = await res.json()
      setSearches((prev) => prev.map((s) => (s.id === id ? updated : s)))
      setEditing(null)
      toast('Updated', 'success')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to update', 'error')
    } finally {
      setSavingId(null)
    }
  }

  async function saveFilterEdit() {
    if (!editingFiltersId) return
    setSavingId(editingFiltersId)
    try {
      const res = await fetch('/api/saved-searches', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editingFiltersId, filters: editFilters }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to update')
      }
      const updated = await res.json()
      setSearches((prev) => prev.map((s) => (s.id === editingFiltersId ? updated : s)))
      setEditingFiltersId(null)
      toast('Filters saved', 'success')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to update', 'error')
    } finally {
      setSavingId(null)
    }
  }

  async function toggleActive(search: SavedSearch) {
    setSavingId(search.id)
    try {
      const res = await fetch('/api/saved-searches', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: search.id, is_active: !search.is_active }),
      })
      if (!res.ok) throw new Error('Failed to toggle')
      const updated = await res.json()
      setSearches((prev) => prev.map((s) => (s.id === search.id ? updated : s)))
      toast(updated.is_active ? 'Search activated' : 'Search paused', 'success')
    } catch {
      toast('Failed to toggle status', 'error')
    } finally {
      setSavingId(null)
    }
  }

  async function handleDelete(id: string) {
    setSavingId(id)
    try {
      const res = await fetch('/api/saved-searches', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (!res.ok) throw new Error('Failed to delete')
      setSearches((prev) => prev.filter((s) => s.id !== id))
      setDeleteConfirm(null)
      toast('Search deleted', 'success')
    } catch {
      toast('Failed to delete search', 'error')
    } finally {
      setSavingId(null)
    }
  }

  function handleEditKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey && editing?.field !== 'notes') {
      e.preventDefault()
      saveEdit()
    }
    if (e.key === 'Escape') setEditing(null)
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  function getGoRate(search: SavedSearch): string {
    const total = search.total_go + search.total_no_go
    if (total === 0) return '--'
    return Math.round((search.total_go / total) * 100) + '%'
  }

  // ─── Loading ───────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="h-8 w-48 animate-pulse rounded bg-zinc-800" />
            <div className="mt-2 h-4 w-64 animate-pulse rounded bg-zinc-800" />
          </div>
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg border border-zinc-800 bg-zinc-900" />
          ))}
        </div>
      </div>
    )
  }

  // ─── Empty State ───────────────────────────────────────────────
  if (searches.length === 0 && !creating) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-white">Saved Searches</h1>
            <p className="mt-1 text-sm text-zinc-400">Manage your Upwork search queries and track their performance.</p>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-zinc-700 bg-zinc-900/50 px-6 py-16">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-800">
            <svg className="h-6 w-6 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
          </div>
          <h3 className="mt-4 text-sm font-medium text-white">No saved searches yet</h3>
          <p className="mt-1 text-sm text-zinc-500">Create your first search to start tracking Upwork opportunities.</p>
          <button
            onClick={() => setCreating(true)}
            className="mt-6 rounded-lg bg-white px-4 py-2 text-sm font-medium text-zinc-900 transition hover:bg-zinc-200"
          >
            Create Search
          </button>
        </div>
      </div>
    )
  }

  // ─── Main ──────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Saved Searches</h1>
          <p className="mt-1 text-sm text-zinc-400">
            {searches.length} search{searches.length !== 1 ? 'es' : ''} &middot;{' '}
            {searches.filter((s) => s.is_active).length} active
          </p>
        </div>
        {!creating && (
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-medium text-zinc-900 transition hover:bg-zinc-200"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            New Search
          </button>
        )}
      </div>

      {/* ─── Create form with filters ──────────────────────────── */}
      {creating && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900">
          {/* Top section: name, query, notes */}
          <div className="border-b border-zinc-800 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-medium text-white">New Saved Search</h2>
              <button
                onClick={() => {
                  setCreating(false)
                  setNewName('')
                  setNewQuery('')
                  setNewNotes('')
                  setNewFilters({ ...DEFAULT_FILTERS, job_type: { ...DEFAULT_FILTERS.job_type } })
                }}
                className="rounded-md p-1.5 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-300"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-3">
              <input
                ref={newNameInputRef}
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Escape') { setCreating(false); setNewName('') } }}
                placeholder="Search name (e.g. React Full-Stack Jobs)"
                className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600"
              />
              <input
                type="text"
                value={newQuery}
                onChange={(e) => setNewQuery(e.target.value)}
                placeholder="Upwork search query (e.g. react next.js typescript)"
                className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600"
              />
              <textarea
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                placeholder="Notes (optional)"
                rows={2}
                className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600 resize-none"
              />
            </div>
          </div>

          {/* Filter panel */}
          <div className="p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <svg className="h-4 w-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
                </svg>
                <span className="text-sm font-medium text-zinc-300">Upwork Filters</span>
                {countActiveFilters(newFilters) > 0 && (
                  <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-400">
                    {countActiveFilters(newFilters)} active
                  </span>
                )}
              </div>
              {countActiveFilters(newFilters) > 0 && (
                <button
                  onClick={() => setNewFilters({ ...DEFAULT_FILTERS, job_type: { ...DEFAULT_FILTERS.job_type } })}
                  className="text-xs text-zinc-500 transition hover:text-zinc-300"
                >
                  Clear all
                </button>
              )}
            </div>

            <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 px-4">
              <FilterPanel filters={newFilters} onChange={setNewFilters} />
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 border-t border-zinc-800 px-5 py-4">
            <button
              onClick={() => {
                setCreating(false)
                setNewName('')
                setNewQuery('')
                setNewNotes('')
                setNewFilters({ ...DEFAULT_FILTERS, job_type: { ...DEFAULT_FILTERS.job_type } })
              }}
              className="rounded-md px-4 py-2 text-sm text-zinc-400 transition hover:bg-zinc-800 hover:text-white"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              className="rounded-md bg-white px-5 py-2 text-sm font-medium text-zinc-900 transition hover:bg-zinc-200"
            >
              Create Search
            </button>
          </div>
        </div>
      )}

      {/* ─── Search list ───────────────────────────────────────── */}
      <div className="space-y-3">
        {searches.map((search) => {
          const parsedF = parseFilters(search.filters)
          const activeCount = countActiveFilters(parsedF)

          return (
            <div
              key={search.id}
              className={`rounded-lg border bg-zinc-900 transition ${
                search.is_active ? 'border-zinc-800' : 'border-zinc-800/50 opacity-60'
              }`}
            >
              <div className="p-5">
                {/* Top row: name + controls */}
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    {/* Name */}
                    {editing?.id === search.id && editing.field === 'name' ? (
                      <input
                        ref={editInputRef as React.RefObject<HTMLInputElement>}
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={handleEditKeyDown}
                        onBlur={saveEdit}
                        disabled={savingId === search.id}
                        className="w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-lg font-medium text-white outline-none focus:border-zinc-600"
                      />
                    ) : (
                      <button onClick={() => startEdit(search, 'name')} className="group flex items-center gap-2 text-left">
                        <h3 className="text-lg font-medium text-white">{search.name}</h3>
                        <svg className="h-3.5 w-3.5 text-zinc-600 opacity-0 transition group-hover:opacity-100" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                        </svg>
                      </button>
                    )}

                    {/* Search query */}
                    <div className="mt-2">
                      {editing?.id === search.id && editing.field === 'search_query' ? (
                        <input
                          ref={editInputRef as React.RefObject<HTMLInputElement>}
                          type="text"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={handleEditKeyDown}
                          onBlur={saveEdit}
                          disabled={savingId === search.id}
                          placeholder="Upwork search query..."
                          className="w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-sm text-zinc-300 outline-none focus:border-zinc-600"
                        />
                      ) : (
                        <button onClick={() => startEdit(search, 'search_query')} className="group flex items-center gap-2 text-left">
                          <span className="text-sm text-zinc-400">
                            {search.search_query || <span className="italic text-zinc-600">No query set — click to edit</span>}
                          </span>
                          <svg className="h-3 w-3 flex-shrink-0 text-zinc-600 opacity-0 transition group-hover:opacity-100" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Controls */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleActive(search)}
                      disabled={savingId === search.id}
                      className="relative flex items-center"
                      title={search.is_active ? 'Pause search' : 'Activate search'}
                    >
                      <div className={`h-5 w-9 rounded-full transition-colors ${search.is_active ? 'bg-emerald-500/30' : 'bg-zinc-700'}`}>
                        <div className={`absolute top-0.5 h-4 w-4 rounded-full transition-all ${search.is_active ? 'left-[18px] bg-emerald-400' : 'left-0.5 bg-zinc-500'}`} />
                      </div>
                    </button>

                    {deleteConfirm === search.id ? (
                      <div className="flex items-center gap-1">
                        <button onClick={() => handleDelete(search.id)} disabled={savingId === search.id} className="rounded px-2 py-1 text-xs font-medium text-red-400 transition hover:bg-red-500/10">Confirm</button>
                        <button onClick={() => setDeleteConfirm(null)} className="rounded px-2 py-1 text-xs text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-300">Cancel</button>
                      </div>
                    ) : (
                      <button onClick={() => setDeleteConfirm(search.id)} className="rounded p-1.5 text-zinc-600 transition hover:bg-zinc-800 hover:text-red-400" title="Delete search">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>

                {/* Filters display — clickable to open panel */}
                <button
                  onClick={() => {
                    setEditingFiltersId(search.id)
                    setEditFilters(parseFilters(search.filters))
                  }}
                  className="mt-3 group flex items-center gap-2 text-left"
                >
                  <svg className="h-3.5 w-3.5 text-zinc-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
                  </svg>
                  <span className="text-xs text-zinc-500 group-hover:text-zinc-400 transition">
                    {summarizeFilters(parsedF)}
                  </span>
                  {activeCount > 0 && (
                    <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">
                      {activeCount}
                    </span>
                  )}
                  <svg className="h-3 w-3 flex-shrink-0 text-zinc-600 opacity-0 transition group-hover:opacity-100" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                  </svg>
                </button>

                {/* Notes */}
                <div className="mt-3">
                  {editing?.id === search.id && editing.field === 'notes' ? (
                    <div className="space-y-2">
                      <textarea
                        ref={editInputRef as React.RefObject<HTMLTextAreaElement>}
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') setEditing(null)
                          if (e.key === 'Enter' && e.metaKey) saveEdit()
                        }}
                        disabled={savingId === search.id}
                        rows={2}
                        placeholder="Notes about this search..."
                        className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-300 outline-none focus:border-zinc-600"
                      />
                      <div className="flex items-center gap-2">
                        <button onClick={saveEdit} disabled={savingId === search.id} className="rounded bg-white px-3 py-1 text-xs font-medium text-zinc-900 transition hover:bg-zinc-200">Save</button>
                        <button onClick={() => setEditing(null)} className="rounded px-3 py-1 text-xs text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-300">Cancel</button>
                        <span className="text-xs text-zinc-600">Cmd+Enter to save</span>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => startEdit(search, 'notes')} className="group flex items-center gap-2 text-left">
                      <span className="text-sm text-zinc-500">
                        {search.notes || <span className="italic text-zinc-700">Add notes...</span>}
                      </span>
                      <svg className="h-3 w-3 flex-shrink-0 text-zinc-600 opacity-0 transition group-hover:opacity-100" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                      </svg>
                    </button>
                  )}
                </div>

                {/* Stats row + date */}
                <div className="mt-4 flex items-center justify-between border-t border-zinc-800 pt-4">
                  <div className="flex items-center gap-6">
                    <div className="flex items-center gap-1.5">
                      <svg className="h-4 w-4 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0" />
                      </svg>
                      <span className="text-sm text-zinc-400">
                        <span className="font-medium text-white">{search.total_jobs_found}</span> jobs
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="h-2 w-2 rounded-full bg-emerald-400" />
                      <span className="text-sm text-zinc-400">
                        <span className="font-medium text-emerald-400">{search.total_go}</span> GO
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="h-2 w-2 rounded-full bg-red-400" />
                      <span className="text-sm text-zinc-400">
                        <span className="font-medium text-red-400">{search.total_no_go}</span> NO-GO
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm text-zinc-500">GO rate:</span>
                      <span
                        className={`text-sm font-medium ${
                          getGoRate(search) === '--'
                            ? 'text-zinc-600'
                            : parseInt(getGoRate(search)) >= 30
                              ? 'text-emerald-400'
                              : parseInt(getGoRate(search)) >= 15
                                ? 'text-amber-400'
                                : 'text-red-400'
                        }`}
                      >
                        {getGoRate(search)}
                      </span>
                    </div>
                  </div>
                  <span className="text-xs text-zinc-600">Created {formatDate(search.created_at)}</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* ─── Filter Edit Slide-Over ────────────────────────────── */}
      {editingFiltersId && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/60"
            onClick={() => setEditingFiltersId(null)}
          />

          {/* Panel */}
          <div className="fixed right-0 top-0 z-50 flex h-screen w-full max-w-md flex-col border-l border-zinc-800 bg-zinc-950 slide-in">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
              <div>
                <h2 className="text-base font-medium text-white">Edit Filters</h2>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {searches.find((s) => s.id === editingFiltersId)?.name}
                </p>
              </div>
              <button
                onClick={() => setEditingFiltersId(null)}
                className="rounded-md p-1.5 text-zinc-500 transition hover:bg-zinc-800 hover:text-white"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Filter counts bar */}
            <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-3">
              <div className="flex items-center gap-2">
                <svg className="h-4 w-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
                </svg>
                {countActiveFilters(editFilters) > 0 ? (
                  <span className="text-xs text-emerald-400 font-medium">{countActiveFilters(editFilters)} filter{countActiveFilters(editFilters) !== 1 ? 's' : ''} active</span>
                ) : (
                  <span className="text-xs text-zinc-500">No filters</span>
                )}
              </div>
              {countActiveFilters(editFilters) > 0 && (
                <button
                  onClick={() => setEditFilters({ ...DEFAULT_FILTERS, job_type: { ...DEFAULT_FILTERS.job_type } })}
                  className="text-xs text-zinc-500 transition hover:text-zinc-300"
                >
                  Clear all
                </button>
              )}
            </div>

            {/* Scrollable filters */}
            <div className="flex-1 overflow-y-auto px-6">
              <FilterPanel filters={editFilters} onChange={setEditFilters} />
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 border-t border-zinc-800 px-6 py-4">
              <button
                onClick={() => setEditingFiltersId(null)}
                className="rounded-md px-4 py-2 text-sm text-zinc-400 transition hover:bg-zinc-800 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={saveFilterEdit}
                disabled={savingId === editingFiltersId}
                className="rounded-md bg-white px-5 py-2 text-sm font-medium text-zinc-900 transition hover:bg-zinc-200 disabled:opacity-50"
              >
                {savingId === editingFiltersId ? 'Saving...' : 'Save Filters'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
