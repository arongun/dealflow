'use client'

import { useState, useEffect } from 'react'
import { Sidebar } from './components/sidebar'
import { ToastProvider } from './components/toast'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [pipelineCount, setPipelineCount] = useState(0)

  useEffect(() => {
    async function fetchCount() {
      try {
        const res = await fetch('/api/jobs?count_active=true')
        if (res.ok) {
          const data = await res.json()
          setPipelineCount(data.active_count ?? 0)
        }
      } catch {
        // Silently fail — count is non-critical
      }
    }
    fetchCount()
    const interval = setInterval(fetchCount, 30000)
    return () => clearInterval(interval)
  }, [])

  return (
    <ToastProvider>
      <div className="flex h-screen overflow-hidden">
        <Sidebar pipelineCount={pipelineCount} />
        <main className="flex-1 overflow-auto">
          <div className="mx-auto max-w-7xl px-6 py-8">{children}</div>
        </main>
      </div>
    </ToastProvider>
  )
}
