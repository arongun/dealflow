'use client'

import { useState, useEffect } from 'react'

interface Stats {
  total_jobs: number
  jobs_this_week: number
  go_rate: number
  active_pipeline: number
  proposals_sent: number
  clients_signed: number
  best_search: { name: string; go_rate: number } | null
  recent_activity: Array<{
    id: string
    job_id: string
    action: string
    details: string
    created_at: string
    job_title: string
  }>
}

function formatRelativeTime(dateString: string): string {
  const now = Date.now()
  const then = new Date(dateString).getTime()
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

function actionColor(action: string): string {
  const lower = action.toLowerCase()
  if (lower.includes('go') || lower.includes('signed') || lower.includes('won'))
    return 'border-emerald-500'
  if (lower.includes('no-go') || lower.includes('skip') || lower.includes('reject'))
    return 'border-red-500'
  if (lower.includes('proposal') || lower.includes('sent'))
    return 'border-blue-500'
  return 'border-zinc-600'
}

function actionBadge(action: string): { text: string; className: string } {
  const lower = action.toLowerCase()
  if (lower.includes('go') && !lower.includes('no-go'))
    return { text: action, className: 'text-emerald-400 bg-emerald-500/10' }
  if (lower.includes('no-go') || lower.includes('skip') || lower.includes('reject'))
    return { text: action, className: 'text-red-400 bg-red-500/10' }
  if (lower.includes('proposal') || lower.includes('sent'))
    return { text: action, className: 'text-blue-400 bg-blue-500/10' }
  return { text: action, className: 'text-zinc-300 bg-zinc-700/50' }
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await fetch('/api/stats')
        if (res.ok) {
          const data = await res.json()
          setStats(data)
        }
      } catch {
        // Silently fail
      } finally {
        setLoading(false)
      }
    }
    fetchStats()
  }, [])

  if (loading) {
    return (
      <div>
        <h1 className="text-lg font-semibold text-white mb-6">Dashboard</h1>
        <p className="text-zinc-500">Loading...</p>
      </div>
    )
  }

  if (!stats) {
    return (
      <div>
        <h1 className="text-lg font-semibold text-white mb-6">Dashboard</h1>
        <p className="text-zinc-500">Failed to load dashboard data.</p>
      </div>
    )
  }

  const statCards = [
    {
      label: 'Total Jobs Processed',
      value: stats.total_jobs.toLocaleString(),
    },
    {
      label: 'Jobs This Week',
      value: stats.jobs_this_week.toLocaleString(),
    },
    {
      label: 'GO Rate',
      value: `${stats.go_rate.toFixed(1)}%`,
      valueClass: 'text-emerald-400',
      badge: stats.go_rate >= 10
        ? { text: 'Healthy', className: 'text-emerald-400 bg-emerald-500/10' }
        : stats.go_rate >= 5
          ? { text: 'Moderate', className: 'text-yellow-400 bg-yellow-500/10' }
          : { text: 'Low', className: 'text-red-400 bg-red-500/10' },
    },
    {
      label: 'Active Pipeline',
      value: stats.active_pipeline.toLocaleString(),
    },
    {
      label: 'Proposals Sent',
      value: stats.proposals_sent.toLocaleString(),
    },
    {
      label: 'Clients Signed',
      value: stats.clients_signed.toLocaleString(),
      valueClass: 'text-emerald-400',
    },
    {
      label: 'Best Saved Search',
      value: stats.best_search
        ? `${stats.best_search.go_rate.toFixed(1)}%`
        : '--',
      subtitle: stats.best_search ? stats.best_search.name : 'No data yet',
      valueClass: stats.best_search ? 'text-emerald-400' : 'text-zinc-500',
    },
  ]

  return (
    <div>
      <h1 className="text-lg font-semibold text-white mb-6">Dashboard</h1>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        {statCards.map((card) => (
          <div
            key={card.label}
            className="bg-zinc-900 border border-zinc-800 rounded-lg p-4"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-zinc-400 text-xs uppercase tracking-wide">
                {card.label}
              </span>
              {card.badge && (
                <span
                  className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${card.badge.className}`}
                >
                  {card.badge.text}
                </span>
              )}
            </div>
            <p className={`text-2xl font-semibold ${card.valueClass || 'text-white'}`}>
              {card.value}
            </p>
            {card.subtitle && (
              <p className="text-zinc-500 text-xs mt-1 truncate">{card.subtitle}</p>
            )}
          </div>
        ))}
      </div>

      {/* Recent Activity */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg">
        <div className="px-4 py-3 border-b border-zinc-800">
          <h2 className="text-sm font-medium text-white">Recent Activity</h2>
        </div>

        {stats.recent_activity.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-zinc-500 text-sm">No recent activity yet.</p>
          </div>
        ) : (
          <ul className="divide-y divide-zinc-800/50">
            {stats.recent_activity.slice(0, 10).map((entry) => {
              const badge = actionBadge(entry.action)
              return (
                <li
                  key={entry.id}
                  className={`flex items-center gap-3 px-4 py-3 border-l-2 ${actionColor(entry.action)} hover:bg-zinc-800/40 transition`}
                >
                  <span
                    className={`shrink-0 text-[11px] font-medium px-2 py-0.5 rounded ${badge.className}`}
                  >
                    {badge.text}
                  </span>
                  <span className="text-sm text-zinc-200 truncate flex-1">
                    {entry.job_title}
                  </span>
                  <span className="text-xs text-zinc-500 shrink-0">
                    {formatRelativeTime(entry.created_at)}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
