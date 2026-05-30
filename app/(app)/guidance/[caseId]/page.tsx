import { redirect, notFound } from 'next/navigation'
import { getCurrentUser } from '@/lib/getCurrentUser'
import Link from 'next/link'
import { getCaseDetail } from '@/lib/guidance/caseManager'
import { buildUserContext } from '@/lib/guidance/buildUserContext'
import { computeConfidence } from '@/lib/guidance/confidence'
import { detectMissingData } from '@/lib/guidance/missingData'
import { computePreparationScore } from '@/lib/guidance/preparationScore'
import { buildSuggestedActions } from '@/lib/guidance/suggestedActions'
import { deadlineUrgencyLabel } from '@/lib/guidance/extractDeadlines'
import { DISCLAIMERS } from '@/lib/guidance/disclaimers'
import CaseResolutionButton from '@/components/guidance/CaseResolutionButton'
import GuidanceTasks from '@/components/guidance/GuidanceTasks'
import { computeReadinessChecklist } from '@/lib/finanzamt/readinessChecklist'
import { buildReadinessSummary, createReadinessTasks } from '@/lib/finanzamt/buildReadinessSummary'
import { computeDeadlineRisk } from '@/lib/finanzamt/deadlineRisk'
import { buildResponsePreparation } from '@/lib/finanzamt/responsePreparation'

const STATUS_PILL: Record<string, string> = {
  OPEN: 'bg-gray-800 text-gray-300',
  ACTION_REQUIRED: 'bg-amber-900 text-amber-300',
  WAITING_FOR_DOCUMENTS: 'bg-blue-900 text-blue-300',
  READY_FOR_REVIEW: 'bg-emerald-900 text-emerald-300',
  ESCALATED: 'bg-red-900 text-red-300',
  RESOLVED: 'bg-gray-800 text-gray-500',
}

const STATUS_LABEL: Record<string, string> = {
  OPEN: 'Open',
  ACTION_REQUIRED: 'Action required',
  WAITING_FOR_DOCUMENTS: 'Waiting for documents',
  READY_FOR_REVIEW: 'Ready for review',
  ESCALATED: 'Escalated — see Steuerberater',
  RESOLVED: 'Resolved',
}

const EVENT_DOT: Record<string, string> = {
  LETTER_UPLOADED: 'bg-blue-500',
  OCR_COMPLETED: 'bg-blue-400',
  DEADLINE_DETECTED: 'bg-amber-500',
  DOCUMENT_MISSING: 'bg-red-500',
  USER_UPLOADED_RECEIPT: 'bg-emerald-500',
  CONFIDENCE_IMPROVED: 'bg-emerald-400',
  ESCALATION_RECOMMENDED: 'bg-red-600',
  CASE_RESOLVED: 'bg-gray-500',
  STATUS_CHANGED: 'bg-gray-400',
}

const PREP_BAR: Record<string, string> = {
  READY: 'bg-emerald-600',
  GOOD: 'bg-blue-600',
  PARTIAL: 'bg-amber-500',
  POOR: 'bg-red-600',
}

const CONFIDENCE_DOT: Record<string, string> = {
  HIGH: 'bg-emerald-500',
  MEDIUM: 'bg-amber-500',
  LOW: 'bg-red-500',
}

const READINESS_URGENCY_CONFIG = {
  CRITICAL: { bg: 'bg-red-950', border: 'border-red-800', text: 'text-red-300', dot: 'bg-red-500' },
  HIGH:     { bg: 'bg-amber-950', border: 'border-amber-800', text: 'text-amber-300', dot: 'bg-amber-500' },
  MEDIUM:   { bg: 'bg-blue-950', border: 'border-blue-800', text: 'text-blue-300', dot: 'bg-blue-500' },
  LOW:      { bg: 'bg-emerald-950', border: 'border-emerald-800', text: 'text-emerald-300', dot: 'bg-emerald-500' },
}

const DEADLINE_RISK_CONFIG = {
  EXPIRED:  { bg: 'bg-red-950', border: 'border-red-800', text: 'text-red-300' },
  CRITICAL: { bg: 'bg-red-950', border: 'border-red-800', text: 'text-red-300' },
  HIGH:     { bg: 'bg-amber-950', border: 'border-amber-800', text: 'text-amber-300' },
  MEDIUM:   { bg: 'bg-amber-950', border: 'border-amber-800', text: 'text-amber-300' },
  LOW:      { bg: 'bg-gray-900', border: 'border-gray-800', text: 'text-gray-300' },
  NONE:     { bg: 'bg-gray-900', border: 'border-gray-800', text: 'text-gray-500' },
}

function groupEventsByDate(
  events: Array<{ id: string; eventType: string; title: string; description: string; createdAt: Date }>
): Map<string, typeof events> {
  const map = new Map<string, typeof events>()
  for (const event of events) {
    const key = event.createdAt.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(event)
  }
  return map
}

interface Props {
  params: Promise<{ caseId: string }>
}

export default async function CaseDetailPage({ params }: Props) {
  const { caseId } = await params
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const now = new Date()
  const currentMonth = now.getMonth() + 1

  const [caseDetail, userCtx] = await Promise.all([
    getCaseDetail(caseId, user.id),
    buildUserContext(user.id),
  ])

  if (!caseDetail) notFound()

  const confidence = computeConfidence(userCtx, currentMonth)
  const missingData = detectMissingData(userCtx, currentMonth)
  const prep = computePreparationScore(userCtx, currentMonth)
  const actions = buildSuggestedActions(
    userCtx,
    missingData,
    caseDetail.detectedLetterType ?? undefined
  )

  // ── Finanzamt readiness (Sprints 10 + 11) ────────────────────────────────
  const caseInfoForReadiness = {
    detectedLetterType: caseDetail.detectedLetterType,
    latestDeadline: caseDetail.latestDeadline,
    escalationRecommended: caseDetail.escalationRecommended,
  }
  const checklist = computeReadinessChecklist(userCtx, caseInfoForReadiness)
  const deadlineRisk = computeDeadlineRisk(caseDetail.latestDeadline)
  const readinessSummary = buildReadinessSummary(userCtx, {
    ...caseInfoForReadiness,
    confidenceLevel: confidence.level,
  })
  const preparation = buildResponsePreparation(caseDetail.detectedLetterType)

  // Auto-create readiness tasks for any missing records (idempotent upsert)
  if (caseDetail.status !== 'RESOLVED') {
    await createReadinessTasks(user.id, readinessSummary.missingRecords, caseDetail.id).catch(() => {})
  }
  // ─────────────────────────────────────────────────────────────────────────

  const eventGroups = groupEventsByDate(caseDetail.events)

  const daysUntilDeadline = caseDetail.latestDeadline
    ? Math.ceil((caseDetail.latestDeadline.getTime() - now.getTime()) / 86400000)
    : null

  const deadlineExpired = daysUntilDeadline !== null && daysUntilDeadline <= 0
  const deadlineUrgent = daysUntilDeadline !== null && daysUntilDeadline > 0 && daysUntilDeadline <= 7

  const urgencyCfg = READINESS_URGENCY_CONFIG[checklist.urgencyLevel]
  const deadlineCfg = DEADLINE_RISK_CONFIG[deadlineRisk.level]

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Back navigation */}
      <Link
        href="/guidance"
        className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300"
      >
        ← Back to Guidance
      </Link>

      {/* Case header */}
      <div className="space-y-2">
        <div className="flex items-center gap-3 flex-wrap">
          <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_PILL[caseDetail.status] ?? 'bg-gray-800 text-gray-400'}`}>
            {STATUS_LABEL[caseDetail.status] ?? caseDetail.status}
          </span>
          {caseDetail.escalationRecommended && caseDetail.status !== 'RESOLVED' && (
            <span className="text-xs bg-red-900 text-red-300 px-2 py-1 rounded-full">
              Professional review recommended
            </span>
          )}
        </div>
        <h1 className="text-xl font-bold text-white">{caseDetail.title}</h1>
        <p className="text-sm text-gray-400 leading-relaxed">{caseDetail.summary}</p>
        <p className="text-xs text-gray-600">
          Opened {caseDetail.openedAt.toLocaleDateString('de-DE')} ·{' '}
          Last updated {caseDetail.updatedAt.toLocaleDateString('de-DE')}
        </p>
      </div>

      {/* Disclaimer */}
      <div className="bg-amber-950 border border-amber-800 rounded-lg p-3">
        <p className="text-xs text-amber-300 leading-relaxed">{DISCLAIMERS.EDUCATIONAL_ONLY}</p>
      </div>

      {/* Deadline alert */}
      {caseDetail.latestDeadline && (
        <div className={`rounded-lg p-4 border ${
          deadlineExpired
            ? 'bg-red-950 border-red-800'
            : deadlineUrgent
            ? 'bg-amber-950 border-amber-800'
            : 'bg-gray-900 border-gray-800'
        }`}>
          <p className={`text-xs font-semibold mb-1 ${
            deadlineExpired ? 'text-red-300' : deadlineUrgent ? 'text-amber-300' : 'text-gray-300'
          }`}>
            {deadlineExpired ? 'Deadline has passed' : 'Deadline'}
          </p>
          <p className={`text-sm font-medium ${
            deadlineExpired ? 'text-red-200' : deadlineUrgent ? 'text-amber-200' : 'text-white'
          }`}>
            {caseDetail.latestDeadline.toLocaleDateString('de-DE')}
            {' '}—{' '}
            {deadlineUrgencyLabel({
              date: caseDetail.latestDeadline,
              rawText: '',
              confidence: 'MEDIUM',
              urgencyBoost: deadlineUrgent,
            })}
          </p>
          {deadlineUrgent && (
            <p className="text-xs text-amber-300 mt-2">
              Only {daysUntilDeadline} day(s) remaining. Review the suggested actions below and complete any outstanding items.
            </p>
          )}
          {deadlineExpired && (
            <p className="text-xs text-red-300 mt-2">
              This deadline has passed. Contact a Steuerberater to understand your options.
            </p>
          )}
        </div>
      )}

      {/* Live confidence + preparation */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <p className="text-xs text-gray-500 mb-2">Current record confidence</p>
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${CONFIDENCE_DOT[confidence.level]}`} />
            <span className="text-sm font-semibold text-white">{confidence.level}</span>
            <span className="text-xs text-gray-600">({confidence.score}/100)</span>
          </div>
          {confidence.reasons.length > 0 && (
            <ul className="mt-2 space-y-0.5">
              {confidence.reasons.slice(0, 2).map((r, i) => (
                <li key={i} className="text-xs text-gray-500 truncate">— {r}</li>
              ))}
              {confidence.reasons.length > 2 && (
                <li className="text-xs text-gray-600">+{confidence.reasons.length - 2} more</li>
              )}
            </ul>
          )}
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <p className="text-xs text-gray-500 mb-2">Preparation score</p>
          <p className="text-sm font-semibold text-white mb-2">{prep.score}/100</p>
          <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${PREP_BAR[prep.status]}`}
              style={{ width: `${prep.score}%` }}
            />
          </div>
          <p className="text-xs text-gray-600 mt-1">{prep.status}</p>
        </div>
      </div>

      {/* ── FINANZAMT READINESS CHECKLIST (Sprint 10) ── */}
      {caseDetail.status !== 'RESOLVED' && (
        <section className={`rounded-lg p-5 border ${urgencyCfg.bg} ${urgencyCfg.border}`}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-white">Finanzamt readiness checklist</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                {checklist.readyCount} of {checklist.totalCount} items ready
              </p>
            </div>
            <div className="text-right">
              <p className={`text-lg font-bold ${urgencyCfg.text}`}>{checklist.score}%</p>
              <p className={`text-xs ${urgencyCfg.text}`}>{checklist.urgencyLevel}</p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden mb-4">
            <div
              className={`h-full rounded-full ${urgencyCfg.dot}`}
              style={{ width: `${checklist.score}%` }}
            />
          </div>

          <ul className="space-y-3">
            {checklist.items.map(item => (
              <li key={item.key} className="flex items-start gap-3">
                <span className={`mt-0.5 shrink-0 text-sm font-bold ${
                  item.ready ? 'text-emerald-400' : 'text-red-400'
                }`}>
                  {item.ready ? '✓' : '✗'}
                </span>
                <div>
                  <p className={`text-xs font-medium ${item.ready ? 'text-gray-300' : 'text-white'}`}>
                    {item.label}
                  </p>
                  {item.note && (
                    <p className={`text-xs mt-0.5 leading-relaxed ${
                      item.ready ? 'text-gray-500' : 'text-amber-300'
                    }`}>
                      {item.note}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>

          {/* Deadline risk from finanzamt engine */}
          {deadlineRisk.level !== 'NONE' && (
            <div className={`mt-4 rounded-lg p-3 border ${deadlineCfg.bg} ${deadlineCfg.border}`}>
              <p className={`text-xs font-semibold ${deadlineCfg.text}`}>{deadlineRisk.label}</p>
              <p className={`text-xs mt-1 leading-relaxed ${deadlineCfg.text}`}>{deadlineRisk.action}</p>
            </div>
          )}

          {checklist.steuerberaterRequired && (
            <div className="mt-3 bg-red-950 border border-red-800 rounded-lg p-3">
              <p className="text-xs text-red-300 font-semibold">Steuerberater review recommended</p>
              <p className="text-xs text-red-400 mt-0.5 leading-relaxed">
                This case has been flagged for professional review. Contact a Steuerberater before responding to the Finanzamt.
              </p>
            </div>
          )}
        </section>
      )}

      {/* Suggested actions */}
      {actions.length > 0 && caseDetail.status !== 'RESOLVED' && (
        <section className="bg-gray-900 border border-gray-800 rounded-lg p-5">
          <h2 className="text-sm font-semibold text-white mb-4">What to do next</h2>
          <ul className="space-y-4">
            {actions.map((action, i) => (
              <li key={i}>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className={`text-xs font-semibold ${
                    action.priority === 'HIGH' ? 'text-red-400'
                    : action.priority === 'MEDIUM' ? 'text-amber-400'
                    : 'text-gray-500'
                  }`}>
                    {action.priority === 'HIGH' ? 'Priority' : action.priority === 'MEDIUM' ? 'Recommended' : 'Optional'}
                  </span>
                  <span className="text-xs font-medium text-white">{action.title}</span>
                </div>
                <p className="text-xs text-gray-400 leading-relaxed">{action.explanation}</p>
                {action.section && (
                  <Link
                    href={action.section}
                    className="inline-block mt-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg px-3 py-1.5 transition-colors"
                  >
                    Go to {action.section.replace('/', '')} →
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Case-specific tasks */}
      {caseDetail.status !== 'RESOLVED' && (
        <GuidanceTasks
          caseId={caseDetail.id}
          maxItems={5}
          title="Tasks for this case"
        />
      )}

      {/* Missing records */}
      {missingData.length > 0 && caseDetail.status !== 'RESOLVED' && (
        <section className="bg-gray-900 border border-gray-800 rounded-lg p-5">
          <h2 className="text-sm font-semibold text-white mb-3">Missing from your records</h2>
          <ul className="space-y-2">
            {missingData.map((item, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className={`text-xs mt-0.5 shrink-0 ${
                  item.severity === 'blocking' ? 'text-red-400' : 'text-amber-400'
                }`}>
                  {item.severity === 'blocking' ? '✗' : '!'}
                </span>
                <p className={`text-xs leading-relaxed ${
                  item.severity === 'blocking' ? 'text-red-300' : 'text-amber-300'
                }`}>
                  {item.description}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── PREPARATION SUMMARY (Sprint 11) ── */}
      {caseDetail.status !== 'RESOLVED' && (
        <section className="bg-gray-900 border border-gray-800 rounded-lg p-5 space-y-5">
          <div>
            <h2 className="text-sm font-semibold text-white mb-1">Preparation summary</h2>
            <p className="text-xs text-gray-400 leading-relaxed">{readinessSummary.plainLanguageSummary}</p>
          </div>

          {/* What Finanzamt wants */}
          <div>
            <h3 className="text-xs font-semibold text-gray-300 mb-1">What the Finanzamt wants</h3>
            <p className="text-xs text-gray-400 leading-relaxed">{readinessSummary.whatFinanzamtWants}</p>
          </div>

          {/* Why it matters */}
          <div>
            <h3 className="text-xs font-semibold text-gray-300 mb-1">Why it matters</h3>
            <p className="text-xs text-gray-400 leading-relaxed">{readinessSummary.whyItMatters}</p>
          </div>

          {/* What we found */}
          <div>
            <h3 className="text-xs font-semibold text-gray-300 mb-2">What we found in your records</h3>
            <ul className="space-y-1">
              {readinessSummary.recordsTaxKontrolFound.map((item, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-emerald-400 text-xs mt-0.5 shrink-0">✓</span>
                  <p className="text-xs text-gray-400">{item}</p>
                </li>
              ))}
            </ul>
          </div>

          {/* What may be missing */}
          {readinessSummary.missingRecords.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-gray-300 mb-2">What may be missing</h3>
              <ul className="space-y-1">
                {readinessSummary.missingRecords.map((item, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-amber-400 text-xs mt-0.5 shrink-0">!</span>
                    <p className="text-xs text-amber-300">{item}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* What not to ignore */}
          {preparation.doNotDo.length > 0 && (
            <div className="bg-red-950 border border-red-800 rounded-lg p-3">
              <h3 className="text-xs font-semibold text-red-300 mb-2">What not to ignore</h3>
              <ul className="space-y-1">
                {preparation.doNotDo.map((item, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-red-400 text-xs mt-0.5 shrink-0">—</span>
                    <p className="text-xs text-red-300">{item}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* What to ask Steuerberater */}
          <div>
            <h3 className="text-xs font-semibold text-gray-300 mb-2">What to ask your Steuerberater</h3>
            <ul className="space-y-1">
              {readinessSummary.suggestedQuestionsForSteuerberater.slice(0, 5).map((q, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-blue-400 text-xs mt-0.5 shrink-0">?</span>
                  <p className="text-xs text-blue-300">{q}</p>
                </li>
              ))}
            </ul>
          </div>

          <p className="text-xs text-gray-600 leading-relaxed border-t border-gray-800 pt-3">
            {readinessSummary.disclaimer}
          </p>
        </section>
      )}

      {/* Full event timeline */}
      <section className="bg-gray-900 border border-gray-800 rounded-lg p-5">
        <h2 className="text-sm font-semibold text-white mb-4">Case timeline</h2>
        {caseDetail.events.length === 0 ? (
          <p className="text-xs text-gray-500">No events recorded yet.</p>
        ) : (
          <div className="space-y-6">
            {Array.from(eventGroups.entries()).map(([dateLabel, events]) => (
              <div key={dateLabel}>
                <p className="text-xs font-semibold text-gray-500 mb-3">{dateLabel}</p>
                <ul className="space-y-3 pl-3 border-l border-gray-800">
                  {events.map(event => (
                    <li key={event.id} className="flex items-start gap-3 -ml-px">
                      <span className={`mt-0.5 w-2 h-2 rounded-full shrink-0 -ml-1 ${EVENT_DOT[event.eventType] ?? 'bg-gray-600'}`} />
                      <div>
                        <p className="text-xs font-medium text-gray-300">{event.title}</p>
                        <p className="text-xs text-gray-500 leading-relaxed mt-0.5">{event.description}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Resolution */}
      {caseDetail.status !== 'RESOLVED' && (
        <section className="bg-gray-900 border border-gray-800 rounded-lg p-5">
          <h2 className="text-sm font-semibold text-white mb-1">Resolve this case</h2>
          <p className="text-xs text-gray-400 mb-4">
            Once you have taken all necessary actions (submitted documents, paid the amount,
            or confirmed the situation is handled), you can mark this case as resolved.
          </p>
          <CaseResolutionButton caseId={caseDetail.id} currentStatus={caseDetail.status} />
        </section>
      )}

      {/* Resolution confirmation */}
      {caseDetail.status === 'RESOLVED' && caseDetail.resolvedAt && (
        <section className="bg-gray-900 border border-gray-800 rounded-lg p-5">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-gray-500" />
            <p className="text-xs text-gray-500">
              Resolved on {caseDetail.resolvedAt.toLocaleDateString('de-DE')}
            </p>
          </div>
        </section>
      )}

      <p className="text-xs text-gray-600 leading-relaxed pb-4">{DISCLAIMERS.BASED_ON_AVAILABLE_RECORDS}</p>
    </div>
  )
}
