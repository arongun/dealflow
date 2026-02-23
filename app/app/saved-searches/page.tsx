'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useToast } from '../components/toast'

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

type EditingField = {
  id: string
  field: 'name' | 'search_query' | 'notes' | 'filters'
}

export default function SavedSearchesPage() {
  const { toast } = useToast()
  const [searches, setSearches] = useState<SavedSearch[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [editing, setEditing] = useState<EditingField | null>(null)
  const [editValue, setEditValue] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const editInputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)
  const newNameInputRef = useRef<HTMLInputElement>(null)

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
    if (editing && editInputRef.current) {
      editInputRef.current.focus()
    }
  }, [editing])

  useEffect(() => {
    if (creating && newNameInputRef.current) {
      newNameInputRef.current.focus()
    }
  }, [creating])

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
          search_query: '',
          filters: {},
          notes: '',
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
      setCreating(false)
      toast('Search created', 'success')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to create search', 'error')
    }
  }

  function startEdit(search: SavedSearch, field: EditingField['field']) {
    let value = ''
    if (field === 'filters') {
      value = JSON.stringify(search.filters, null, 2)
    } else {
      value = (search[field] as string) ?? ''
    }
    setEditing({ id: search.id, field })
    setEditValue(value)
  }

  async function saveEdit() {
    if (!editing) return

    const { id, field } = editing
    let payload: Record<string, unknown> = { id }

    if (field === 'filters') {
      try {
        payload.filters = JSON.parse(editValue)
      } catch {
        toast('Invalid JSON for filters', 'error')
        return
      }
    } else if (field === 'name') {
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
    if (e.key === 'Enter' && !e.shiftKey && editing?.field !== 'filters' && editing?.field !== 'notes') {
      e.preventDefault()
      saveEdit()
    }
    if (e.key === 'Escape') {
      setEditing(null)
    }
  }

  function formatFilters(filters: Record<string, unknown>): string {
    if (!filters || Object.keys(filters).length === 0) return 'No filters'
    return Object.entries(filters)
      .map(([key, value]) => {
        const label = key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
        if (typeof value === 'object' && value !== null) {
          const obj = value as Record<string, unknown>
          if ('min' in obj && 'max' in obj) {
            return `${label}: $${obj.min} - $${obj.max}`
          }
          return `${label}: ${JSON.stringify(value)}`
        }
        return `${label}: ${value}`
      })
      .join(' | ')
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

  // --- Loading state ---
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

  // --- Empty state ---
  if (searches.length === 0 && !creating) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-white">Saved Searches</h1>
            <p className="mt-1 text-sm text-zinc-400">
              Manage your Upwork search queries and track their performance.
            </p>
          </div>
        </div>

        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-zinc-700 bg-zinc-900/50 px-6 py-16">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-800">
            <svg className="h-6 w-6 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
          </div>
          <h3 className="mt-4 text-sm font-medium text-white">No saved searches yet</h3>
          <p className="mt-1 text-sm text-zinc-500">
            Create your first search to start tracking Upwork opportunities.
          </p>
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

  // --- Main view ---
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
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-medium text-zinc-900 transition hover:bg-zinc-200"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          New Search
        </button>
      </div>

      {/* Create form */}
      {creating && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
          <div className="flex items-center gap-3">
            <input
              ref={newNameInputRef}
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate()
                if (e.key === 'Escape') {
                  setCreating(false)
                  setNewName('')
                }
              }}
              placeholder="Search name (e.g. React Full-Stack Jobs)"
              className="flex-1 rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none focus:border-zinc-600 focus:ring-1 focus:ring-zinc-600"
            />
            <button
              onClick={handleCreate}
              className="rounded-md bg-white px-4 py-2 text-sm font-medium text-zinc-900 transition hover:bg-zinc-200"
            >
              Create
            </button>
            <button
              onClick={() => {
                setCreating(false)
                setNewName('')
              }}
              className="rounded-md px-3 py-2 text-sm text-zinc-400 transition hover:bg-zinc-800 hover:text-white"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Search list */}
      <div className="space-y-3">
        {searches.map((search) => (
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
                    <button
                      onClick={() => startEdit(search, 'name')}
                      className="group flex items-center gap-2 text-left"
                    >
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
                      <button
                        onClick={() => startEdit(search, 'search_query')}
                        className="group flex items-center gap-2 text-left"
                      >
                        <span className="text-sm text-zinc-400">
                          {search.search_query || (
                            <span className="italic text-zinc-600">No query set -- click to edit</span>
                          )}
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
                  {/* Active toggle */}
                  <button
                    onClick={() => toggleActive(search)}
                    disabled={savingId === search.id}
                    className="relative flex items-center"
                    title={search.is_active ? 'Pause search' : 'Activate search'}
                  >
                    <div
                      className={`h-5 w-9 rounded-full transition-colors ${
                        search.is_active ? 'bg-emerald-500/30' : 'bg-zinc-700'
                      }`}
                    >
                      <div
                        className={`absolute top-0.5 h-4 w-4 rounded-full transition-all ${
                          search.is_active
                            ? 'left-[18px] bg-emerald-400'
                            : 'left-0.5 bg-zinc-500'
                        }`}
                      />
                    </div>
                  </button>

                  {/* Delete */}
                  {deleteConfirm === search.id ? (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleDelete(search.id)}
                        disabled={savingId === search.id}
                        className="rounded px-2 py-1 text-xs font-medium text-red-400 transition hover:bg-red-500/10"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(null)}
                        className="rounded px-2 py-1 text-xs text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-300"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDeleteConfirm(search.id)}
                      className="rounded p-1.5 text-zinc-600 transition hover:bg-zinc-800 hover:text-red-400"
                      title="Delete search"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>

              {/* Filters display */}
              <div className="mt-3">
                {editing?.id === search.id && editing.field === 'filters' ? (
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
                      rows={4}
                      placeholder='{"budget_range": {"min": 500, "max": 5000}, "category": "Web Development"}'
                      className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 font-mono text-xs text-zinc-300 outline-none focus:border-zinc-600"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        onClick={saveEdit}
                        disabled={savingId === search.id}
                        className="rounded bg-white px-3 py-1 text-xs font-medium text-zinc-900 transition hover:bg-zinc-200"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditing(null)}
                        className="rounded px-3 py-1 text-xs text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-300"
                      >
                        Cancel
                      </button>
                      <span className="text-xs text-zinc-600">Cmd+Enter to save</span>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => startEdit(search, 'filters')}
                    className="group flex items-center gap-2 text-left"
                  >
                    <span className="text-xs text-zinc-500">{formatFilters(search.filters)}</span>
                    <svg className="h-3 w-3 flex-shrink-0 text-zinc-600 opacity-0 transition group-hover:opacity-100" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                    </svg>
                  </button>
                )}
              </div>

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
                      <button
                        onClick={saveEdit}
                        disabled={savingId === search.id}
                        className="rounded bg-white px-3 py-1 text-xs font-medium text-zinc-900 transition hover:bg-zinc-200"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditing(null)}
                        className="rounded px-3 py-1 text-xs text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-300"
                      >
                        Cancel
                      </button>
                      <span className="text-xs text-zinc-600">Cmd+Enter to save</span>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => startEdit(search, 'notes')}
                    className="group flex items-center gap-2 text-left"
                  >
                    <span className="text-sm text-zinc-500">
                      {search.notes || (
                        <span className="italic text-zinc-700">Add notes...</span>
                      )}
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
                  {/* Total jobs */}
                  <div className="flex items-center gap-1.5">
                    <svg className="h-4 w-4 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
                    <span className="text-sm text-zinc-400">
                      <span className="font-medium text-white">{search.total_jobs_found}</span> jobs
                    </span>
                  </div>

                  {/* GO */}
                  <div className="flex items-center gap-1.5">
                    <div className="h-2 w-2 rounded-full bg-emerald-400" />
                    <span className="text-sm text-zinc-400">
                      <span className="font-medium text-emerald-400">{search.total_go}</span> GO
                    </span>
                  </div>

                  {/* NO-GO */}
                  <div className="flex items-center gap-1.5">
                    <div className="h-2 w-2 rounded-full bg-red-400" />
                    <span className="text-sm text-zinc-400">
                      <span className="font-medium text-red-400">{search.total_no_go}</span> NO-GO
                    </span>
                  </div>

                  {/* GO rate */}
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

                <span className="text-xs text-zinc-600">
                  Created {formatDate(search.created_at)}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
