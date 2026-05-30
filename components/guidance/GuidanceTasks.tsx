'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { StoredTask } from '@/lib/guidance/guidanceTypes'
import { getGuidedFlow, formatTime } from '@/lib/guidance/guidedFlows'

interface Props {
  caseId?: string
  maxItems?: number
  title?: string
}

const PRIORITY_BADGE: Record<string, string> = {
  CRITICAL: 'text-red-400',
  HIGH: 'text-orange-400',
  MEDIUM: 'text-amber-400',
  LOW: 'text-gray-500',
}

const PRIORITY_LABEL: Record<string, string> = {
  CRITICAL: 'Urgent',
  HIGH: 'Priority',
  MEDIUM: 'Recommended',
  LOW: 'Optional',
}

const CATEGORY_ICON: Record<string, string> = {
  UPLOAD_DOCUMENT: '📄',
  ADD_TRANSACTION: '➕',
  CATEGORIZE_EXPENSE: '🏷️',
  COMPLETE_PROFILE: '👤',
  REVIEW_REPORT: '📊',
  CONTACT_STEUERBERATER: '🧑‍💼',
  RESOLVE_CASE: '📬',
  OTHER: '•',
}

export default function GuidanceTasks({ caseId, maxItems = 5, title = 'Next best steps' }: Props) {
  const [tasks, setTasks] = useState<StoredTask[]>([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<string | null>(null)
  const [justDone, setJustDone] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetch('/api/v1/guidance/tasks')
      .then(r => r.json())
      .then((data: StoredTask[]) => {
        if (Array.isArray(data)) setTasks(data)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const visible = tasks
    .filter(t => t.status !== 'COMPLETED' && t.status !== 'DISMISSED')
    .filter(t => !caseId || t.caseId === caseId)
    .slice(0, maxItems)

  const completedCount = tasks.filter(t => t.status === 'COMPLETED').length
  const totalOpen = tasks.filter(t => t.status !== 'COMPLETED' && t.status !== 'DISMISSED').length

  async function updateTask(taskId: string, status: 'COMPLETED' | 'DISMISSED') {
    setUpdating(taskId)
    try {
      const res = await fetch('/api/v1/guidance/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, status }),
      })
      if (!res.ok) return

      if (status === 'COMPLETED') {
        setJustDone(prev => new Set(prev).add(taskId))
        setTimeout(() => {
          setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: 'COMPLETED' } : t))
          setJustDone(prev => { const s = new Set(prev); s.delete(taskId); return s })
        }, 1400)
      } else {
        setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: 'DISMISSED' } : t))
      }
    } catch {
      // Non-critical
    } finally {
      setUpdating(null)
    }
  }

  if (loading) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-5">
        <p className="text-sm font-semibold text-white mb-3">{title}</p>
        <div className="space-y-3">
          {[1, 2].map(n => (
            <div key={n} className="h-16 bg-gray-800 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (visible.length === 0) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-5">
        <p className="text-sm font-semibold text-white mb-2">{title}</p>
        {completedCount > 0 ? (
          <p className="text-xs text-emerald-400">
            ✓ {completedCount} task(s) completed. No open tasks right now — check back after adding more records.
          </p>
        ) : (
          <p className="text-xs text-gray-500">No tasks at the moment.</p>
        )}
      </div>
    )
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-semibold text-white">{title}</p>
        {completedCount > 0 && (
          <span className="text-xs text-emerald-400 font-medium">{completedCount} done</span>
        )}
      </div>

      <ul className="space-y-5">
        {visible.map(task => {
          const flow = getGuidedFlow(task.taskKey, task.category, task.caseId)
          const isDone = justDone.has(task.id)
          const isUpdating = updating === task.id

          return (
            <li
              key={task.id}
              className={`transition-all duration-500 ${isDone ? 'opacity-30 scale-95' : 'opacity-100'}`}
            >
              <div className="flex items-start gap-3">
                <span className="text-lg mt-0.5 shrink-0 leading-none">
                  {CATEGORY_ICON[task.category] ?? '•'}
                </span>

                <div className="flex-1 min-w-0">
                  {/* Priority + done indicator */}
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className={`text-xs font-semibold ${PRIORITY_BADGE[task.priority]}`}>
                      {PRIORITY_LABEL[task.priority] ?? task.priority}
                    </span>
                    {isDone && (
                      <span className="text-xs text-emerald-400 font-medium">✓ Done!</span>
                    )}
                  </div>

                  {/* Title */}
                  <p className="text-sm text-white font-medium leading-snug">{task.title}</p>

                  {/* Description */}
                  <p className="text-xs text-gray-400 leading-relaxed mt-0.5">{task.description}</p>

                  {/* Flow helper text + time estimate */}
                  {flow && !isDone && (
                    <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                      {flow.helperText}
                      {' · '}
                      <span className="text-gray-600">Usually {formatTime(flow.estimatedMinutes)}</span>
                    </p>
                  )}

                  {/* Action row — larger touch targets for mobile */}
                  {!isDone && (
                    <div className="flex items-center gap-2 mt-3 flex-wrap">
                      {/* Primary Start button */}
                      {flow ? (
                        <Link
                          href={flow.route}
                          className="inline-flex items-center gap-1.5 text-sm bg-blue-700 hover:bg-blue-600 text-white rounded-lg px-4 py-2 font-medium transition-colors min-h-[36px]"
                        >
                          Start →
                        </Link>
                      ) : task.relatedSection ? (
                        <Link
                          href={task.relatedSection}
                          className="inline-flex items-center gap-1.5 text-sm bg-blue-700 hover:bg-blue-600 text-white rounded-lg px-4 py-2 font-medium transition-colors min-h-[36px]"
                        >
                          Start →
                        </Link>
                      ) : null}

                      {/* Mark done */}
                      <button
                        onClick={() => updateTask(task.id, 'COMPLETED')}
                        disabled={isUpdating}
                        className="text-sm text-emerald-500 hover:text-emerald-300 disabled:opacity-50 transition-colors min-h-[36px] px-2"
                      >
                        {isUpdating ? '...' : 'Mark done'}
                      </button>

                      {/* Dismiss — secondary, less prominent */}
                      <button
                        onClick={() => updateTask(task.id, 'DISMISSED')}
                        disabled={isUpdating}
                        className="text-xs text-gray-600 hover:text-gray-400 disabled:opacity-50 transition-colors min-h-[36px] px-1"
                      >
                        Dismiss
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </li>
          )
        })}
      </ul>

      {totalOpen > maxItems && (
        <p className="text-xs text-gray-600 mt-5 pt-3 border-t border-gray-800">
          +{totalOpen - maxItems} more task(s) — complete these first, then the rest will appear.
        </p>
      )}
    </div>
  )
}
