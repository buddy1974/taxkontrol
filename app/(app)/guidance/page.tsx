import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/getCurrentUser'
import { buildUserContext, getPersonaProfile } from '@/lib/guidance/buildUserContext'
import { computeConfidence } from '@/lib/guidance/confidence'
import { detectMissingData } from '@/lib/guidance/missingData'
import { computePreparationScore } from '@/lib/guidance/preparationScore'
import { buildSuggestedActions } from '@/lib/guidance/suggestedActions'
import { getOpenCases, getUpcomingDeadlines } from '@/lib/guidance/caseManager'
import { getOpenIssues } from '@/lib/guidance/openIssues'
import { DISCLAIMERS } from '@/lib/guidance/disclaimers'
import { getHelperText } from '@/lib/guidance/helperText'
import { deadlineUrgencyLabel } from '@/lib/guidance/extractDeadlines'
import { buildPersonaContext } from '@/lib/guidance/personaContext'
import { getBusinessRhythm } from '@/lib/guidance/businessRhythm'
import { computeProfileCompleteness } from '@/lib/guidance/profileCompleteness'
import GuidanceInfoBox from '@/components/guidance/GuidanceInfoBox'
import LetterUploader from '@/components/guidance/LetterUploader'
import PersonaSetup from '@/components/guidance/PersonaSetup'
import GuidanceTasks from '@/components/guidance/GuidanceTasks'
import PreparationProgress from '@/components/guidance/PreparationProgress'
import MicroProfileQuestion from '@/components/guidance/MicroProfileQuestion'
import SmartSuggestions from '@/components/guidance/SmartSuggestions'
import Link from 'next/link'

const CONFIDENCE_DOT: Record<string, string> = {
  HIGH: 'bg-emerald-500',
  MEDIUM: 'bg-amber-500',
  LOW: 'bg-red-500',
}

const STATUS_LABEL: Record<string, string> = {
  READY: 'Ready for Steuerberater',
  GOOD: 'Good progress',
  PARTIAL: 'Partially prepared',
  POOR: 'Needs attention',
}

const STATUS_PILL: Record<string, string> = {
  READY: 'bg-emerald-900 text-emerald-300',
  GOOD: 'bg-blue-900 text-blue-300',
  PARTIAL: 'bg-amber-900 text-amber-300',
  POOR: 'bg-red-900 text-red-300',
}

const STATUS_BAR: Record<string, string> = {
  READY: 'bg-emerald-600',
  GOOD: 'bg-blue-600',
  PARTIAL: 'bg-amber-500',
  POOR: 'bg-red-600',
}

const CASE_STATUS_PILL: Record<string, string> = {
  OPEN: 'bg-gray-800 text-gray-300',
  ACTION_REQUIRED: 'bg-amber-900 text-amber-300',
  WAITING_FOR_DOCUMENTS: 'bg-blue-900 text-blue-300',
  READY_FOR_REVIEW: 'bg-emerald-900 text-emerald-300',
  ESCALATED: 'bg-red-900 text-red-300',
  RESOLVED: 'bg-gray-800 text-gray-500',
}

const CASE_STATUS_LABEL: Record<string, string> = {
  OPEN: 'Open',
  ACTION_REQUIRED: 'Action required',
  WAITING_FOR_DOCUMENTS: 'Waiting for documents',
  READY_FOR_REVIEW: 'Ready for review',
  ESCALATED: 'Escalated',
  RESOLVED: 'Resolved',
}

const PRIORITY_COLOR: Record<string, string> = {
  CRITICAL: 'text-red-400',
  HIGH: 'text-orange-400',
  MEDIUM: 'text-amber-400',
  LOW: 'text-gray-500',
}

const URGENCY_DOT: Record<string, string> = {
  IMMEDIATE: 'bg-red-500',
  WITHIN_WEEK: 'bg-orange-400',
  WITHIN_MONTH: 'bg-amber-400',
  INFORMATIONAL: 'bg-gray-500',
}

export default async function GuidancePage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const now = new Date()
  const currentMonth = now.getMonth() + 1

  const [userCtx, personaProfileRaw, openCases, upcomingDeadlines, openIssues] = await Promise.all([
    buildUserContext(user.id),
    getPersonaProfile(user.id),
    getOpenCases(user.id),
    getUpcomingDeadlines(user.id),
    getOpenIssues(user.id),
  ])

  const personaCtx = buildPersonaContext(personaProfileRaw)
  const rhythm = getBusinessRhythm(personaProfileRaw, userCtx.monthsWithTransactions, currentMonth)
  const profileCompleteness = computeProfileCompleteness(personaProfileRaw)

  const confidence = computeConfidence(userCtx, currentMonth)
  const missingData = detectMissingData(userCtx, currentMonth)
  const prep = computePreparationScore(userCtx, currentMonth, personaProfileRaw)
  const actions = buildSuggestedActions(userCtx, missingData, undefined, personaCtx)

  const guidanceHelper = getHelperText('guidance')
  const prepHelper = getHelperText('preparationStatus')

  const blockingCount = missingData.filter(d => d.severity === 'blocking').length
  const importantCount = missingData.filter(d => d.severity === 'important').length
  const escalatedCases = openCases.filter(c => c.status === 'ESCALATED')
  const criticalIssues = openIssues.filter(i => i.priority === 'CRITICAL')

  const expectedMonths = Array.from({ length: currentMonth }, (_, i) => i + 1)
  const transactionCoverage =
    expectedMonths.length > 0
      ? (expectedMonths.filter(m => userCtx.monthsWithTransactions.includes(m)).length) /
        expectedMonths.length
      : 0

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Finanzamt Guidance</h1>
        <p className="text-sm text-gray-400 mt-1">{guidanceHelper?.explanation}</p>
      </div>

      <GuidanceInfoBox
        title="What is this page?"
        whatIsThis="This page helps you understand how complete your financial records are and what may be missing. It also helps you understand any letters you receive from the Finanzamt (German tax authority)."
        examples={[
          'Missing receipts for business expenses',
          'Missing transactions that should be recorded',
          'Missing bank statement imports',
          'Incomplete business profile information',
          'Finanzamt letters that need a response',
        ]}
        whyItMatters="The more complete your records are, the more accurate TaxKontrol can be — and the less stress you will have if the Finanzamt asks questions."
        importantNote="This page is for preparation and understanding only. TaxKontrol does not communicate with the Finanzamt on your behalf. Always verify important actions with a Steuerberater."
      />

      {/* Disclaimer */}
      <div className="bg-amber-950 border border-amber-800 rounded-lg p-4">
        <p className="text-xs text-amber-300 leading-relaxed">
          {DISCLAIMERS.EDUCATIONAL_ONLY} {DISCLAIMERS.VERIFY_WITH_STEUERBERATER}
        </p>
      </div>

      {/* Escalation alert */}
      {escalatedCases.length > 0 && (
        <div className="bg-red-950 border border-red-800 rounded-lg p-4">
          <p className="text-xs font-semibold text-red-300 mb-1">
            {escalatedCases.length} case(s) require professional review
          </p>
          <p className="text-xs text-red-200 leading-relaxed">
            {escalatedCases.map(c => c.title).join(' · ')} —{' '}
            please consult a Steuerberater before responding.
          </p>
        </div>
      )}

      {/* Critical issues */}
      {criticalIssues.length > 0 && (
        <div className="bg-orange-950 border border-orange-800 rounded-lg p-4 space-y-2">
          <p className="text-xs font-semibold text-orange-300">Needs immediate attention</p>
          {criticalIssues.map(issue => (
            <div key={issue.id}>
              <p className="text-xs text-orange-200 font-medium">{issue.title}</p>
              <p className="text-xs text-orange-300 opacity-80">{issue.description}</p>
            </div>
          ))}
        </div>
      )}

      {/* Live status row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-3">
          <p className="text-xs text-gray-500 mb-1">Confidence</p>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${CONFIDENCE_DOT[confidence.level]}`} />
            <span className="text-sm font-semibold text-white">{confidence.level}</span>
          </div>
          <p className="text-xs text-gray-600 mt-1">{confidence.score}/100</p>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-lg p-3">
          <p className="text-xs text-gray-500 mb-1">Readiness</p>
          <p className="text-sm font-semibold text-white">{prep.score}/100</p>
          <p className="text-xs text-gray-600 mt-1">{STATUS_LABEL[prep.status]}</p>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-lg p-3">
          <p className="text-xs text-gray-500 mb-1">Open cases</p>
          <p className="text-sm font-semibold text-white">{openCases.length}</p>
          <p className="text-xs text-gray-600 mt-1">
            {escalatedCases.length > 0 ? `${escalatedCases.length} escalated` : 'No escalations'}
          </p>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-lg p-3">
          <p className="text-xs text-gray-500 mb-1">Issues</p>
          <p className="text-sm font-semibold text-white">{blockingCount + importantCount}</p>
          <p className="text-xs text-gray-600 mt-1">
            {blockingCount} blocking · {importantCount} important
          </p>
        </div>
      </div>

      {/* Preparation progress */}
      <PreparationProgress
        preparationScore={prep.score}
        profileCompleteness={profileCompleteness.completionPercent}
        transactionCoverage={transactionCoverage}
        uploadCount={userCtx.uploadedDocumentCount}
        uncategorizedCount={userCtx.uncategorizedCount}
        totalTransactions={userCtx.totalTransactionCount}
      />

      {/* Persona snapshot */}
      <section className="bg-gray-900 border border-gray-800 rounded-lg p-5">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-sm font-semibold text-white">Your guidance profile</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {personaCtx.profile
                ? 'Guidance is adapted for your business type and situation.'
                : 'Complete your profile to personalize guidance for your specific situation.'}
            </p>
          </div>
          {personaCtx.profile && (
            <div className="shrink-0 text-right">
              <p className="text-xs text-gray-500">Profile completeness</p>
              <p className={`text-sm font-semibold ${
                profileCompleteness.completionPercent >= 85 ? 'text-emerald-400'
                : profileCompleteness.completionPercent >= 50 ? 'text-amber-400'
                : 'text-red-400'
              }`}>
                {profileCompleteness.completionPercent}%
              </p>
            </div>
          )}
        </div>

        {personaCtx.profile && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4 text-xs">
            <div className="bg-gray-800 rounded-lg p-3">
              <p className="text-gray-500 mb-0.5">Business</p>
              <p className="text-white font-medium">{personaCtx.businessLabel}</p>
            </div>
            <div className="bg-gray-800 rounded-lg p-3">
              <p className="text-gray-500 mb-0.5">Guidance mode</p>
              <p className="text-white font-medium">{personaCtx.guidanceMode}</p>
            </div>
            <div className="bg-gray-800 rounded-lg p-3">
              <p className="text-gray-500 mb-0.5">Organization</p>
              <p className="text-white font-medium">{personaCtx.organizationLabel}</p>
            </div>
          </div>
        )}

        {personaCtx.flags.needsSimplifiedGuidance && personaCtx.profile && (
          <div className="bg-blue-950 border border-blue-900 rounded-lg p-3 mb-3">
            <p className="text-xs text-blue-300">
              Guidance is set to simple mode — explanations will be kept clear and step-by-step.
            </p>
          </div>
        )}

        {personaCtx.flags.highAnxietyRisk && personaCtx.profile && (
          <div className="bg-gray-800 rounded-lg p-3 mb-3">
            <p className="text-xs text-gray-300">
              Tax paperwork can feel overwhelming. TaxKontrol is here to help you prepare — not to judge your situation.
            </p>
          </div>
        )}

        {profileCompleteness.completionPercent < 85 && (
          <div className="mb-4">
            <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden mb-2">
              <div
                className="h-full bg-blue-600 rounded-full"
                style={{ width: `${profileCompleteness.completionPercent}%` }}
              />
            </div>
            <p className="text-xs text-gray-500">{profileCompleteness.guidanceQualityImpact}</p>
          </div>
        )}

        <PersonaSetup initialProfile={personaProfileRaw} />
      </section>

      {/* Micro profile question — one at a time, non-intrusive */}
      {personaProfileRaw && <MicroProfileQuestion profile={personaProfileRaw} />}

      {/* Next best steps — task engine */}
      <GuidanceTasks
        maxItems={personaCtx.profile?.organizationLevel === 'OVERWHELMED' ? 3 : 5}
        title="Next best steps"
      />

      {/* Business rhythm note */}
      {rhythm.anomalyNote && (
        <section className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <p className="text-xs font-semibold text-white mb-1">Business rhythm note</p>
          <p className="text-xs text-gray-400 leading-relaxed">{rhythm.anomalyNote}</p>
          <p className="text-xs text-gray-600 mt-2 italic">{rhythm.rhythmSummary}</p>
        </section>
      )}

      {/* Open cases */}
      {openCases.length > 0 && (
        <section className="bg-gray-900 border border-gray-800 rounded-lg p-5">
          <h2 className="text-sm font-semibold text-white mb-4">Open cases</h2>
          <ul className="space-y-4">
            {openCases.map(c => (
              <li key={c.id} className="border border-gray-800 rounded-lg p-4 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CASE_STATUS_PILL[c.status] ?? 'bg-gray-800 text-gray-400'}`}>
                        {CASE_STATUS_LABEL[c.status] ?? c.status}
                      </span>
                      <span className={`w-1.5 h-1.5 rounded-full ${URGENCY_DOT[c.urgency] ?? 'bg-gray-600'}`} />
                    </div>
                    <p className="text-sm text-white font-medium mt-1">{c.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{c.summary}</p>
                  </div>
                  <Link
                    href={`/guidance/${c.id}`}
                    className="shrink-0 text-xs text-blue-400 hover:text-blue-300 border border-blue-900 hover:border-blue-700 rounded-lg px-3 py-1.5 transition-colors"
                  >
                    View →
                  </Link>
                </div>

                {c.latestDeadline && (
                  <p className="text-xs text-amber-300">
                    Deadline: {deadlineUrgencyLabel({ date: c.latestDeadline, rawText: '', confidence: 'MEDIUM', urgencyBoost: false })}
                    {' '}({c.latestDeadline.toLocaleDateString('de-DE')})
                  </p>
                )}

                {c.recentEvents.length > 0 && (
                  <div className="space-y-1 pt-1 border-t border-gray-800">
                    {c.recentEvents.map((e, i) => (
                      <p key={i} className="text-xs text-gray-500">
                        {e.createdAt.toLocaleDateString('de-DE')} — {e.title}
                      </p>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Upcoming deadlines */}
      {upcomingDeadlines.length > 0 && (
        <section className="bg-gray-900 border border-gray-800 rounded-lg p-5">
          <h2 className="text-sm font-semibold text-white mb-3">Upcoming deadlines</h2>
          <ul className="space-y-2">
            {upcomingDeadlines.map(d => {
              const diffDays = Math.ceil(
                (d.latestDeadline!.getTime() - now.getTime()) / 86400000
              )
              return (
                <li key={d.id} className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-white">{d.title}</p>
                    <p className={`text-xs mt-0.5 ${diffDays <= 7 ? 'text-amber-400' : 'text-gray-500'}`}>
                      {deadlineUrgencyLabel({ date: d.latestDeadline!, rawText: '', confidence: 'MEDIUM', urgencyBoost: diffDays <= 7 })}
                    </p>
                  </div>
                  <span className={`text-xs font-medium ${diffDays <= 3 ? 'text-red-400' : diffDays <= 7 ? 'text-amber-400' : 'text-gray-400'}`}>
                    {d.latestDeadline!.toLocaleDateString('de-DE')}
                  </span>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {/* Preparation score bar */}
      <section className="bg-gray-900 border border-gray-800 rounded-lg p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-semibold text-white">{prepHelper?.title}</h2>
            <p className="text-xs text-gray-400 mt-0.5">{prepHelper?.explanation}</p>
          </div>
          <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_PILL[prep.status]}`}>
            {STATUS_LABEL[prep.status]}
          </span>
        </div>

        <div className="flex items-center gap-3 mb-4">
          <div className="h-2 flex-1 bg-gray-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${STATUS_BAR[prep.status]}`}
              style={{ width: `${prep.score}%` }}
            />
          </div>
          <span className="text-xs text-gray-400 shrink-0">{prep.score} / 100</span>
        </div>

        {prep.strengths.length > 0 && (
          <div className="space-y-1 mb-3">
            <p className="text-xs text-gray-500 font-medium">What looks good:</p>
            {prep.strengths.map((s, i) => (
              <p key={i} className="text-xs text-emerald-400 flex items-start gap-1.5">
                <span>✓</span><span>{s}</span>
              </p>
            ))}
          </div>
        )}

        {prep.estimatedPreparationSavingsHours > 0 && (
          <p className="text-xs text-gray-600">
            Completing your records could save approximately {prep.estimatedPreparationSavingsHours} hour(s) of Steuerberater consultation time.
          </p>
        )}
      </section>

      {/* Unresolved issues */}
      {openIssues.length > 0 && (
        <section className="bg-gray-900 border border-gray-800 rounded-lg p-5">
          <h2 className="text-sm font-semibold text-white mb-3">
            Unresolved issues ({openIssues.length})
          </h2>
          <ul className="space-y-3">
            {openIssues.slice(0, 8).map(issue => (
              <li key={issue.id} className="flex items-start gap-2">
                <span className={`text-xs font-semibold mt-0.5 shrink-0 ${PRIORITY_COLOR[issue.priority]}`}>
                  {issue.priority}
                </span>
                <div>
                  <p className="text-xs text-white">{issue.title}</p>
                  <p className="text-xs text-gray-400 leading-relaxed mt-0.5">{issue.description}</p>
                  {issue.dueDate && (
                    <p className="text-xs text-amber-400 mt-0.5">
                      Due: {issue.dueDate.toLocaleDateString('de-DE')}
                    </p>
                  )}
                </div>
              </li>
            ))}
            {openIssues.length > 8 && (
              <li className="text-xs text-gray-500">
                +{openIssues.length - 8} more issues
              </li>
            )}
          </ul>
        </section>
      )}

      {/* Missing from records */}
      {missingData.length > 0 && (
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

      {/* Suggested actions */}
      {actions.length > 0 && (
        <section className="bg-gray-900 border border-gray-800 rounded-lg p-5">
          <h2 className="text-sm font-semibold text-white mb-3">Suggested actions</h2>
          <ul className="space-y-4">
            {actions.map((action, i) => (
              <li key={i}>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className={`text-xs font-medium ${
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
                    className="text-xs text-blue-400 hover:text-blue-300 mt-1 inline-block"
                  >
                    Go to section →
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Smart suggestions */}
      <SmartSuggestions />

      {/* Upload Finanzamt letter */}
      <section className="bg-gray-900 border border-gray-800 rounded-lg p-5">
        <h2 className="text-sm font-semibold text-white mb-1">Upload Finanzamt Letter</h2>
        <p className="text-xs text-gray-400 mb-4">
          Upload a letter or notice from the Finanzamt. We will extract the text, classify it,
          detect any deadlines, and give you a plain-language explanation with next steps.
          A case record will be saved to track the situation over time.
        </p>
        <LetterUploader />
        <p className="text-xs text-gray-600 mt-4">{DISCLAIMERS.NO_GUARANTEE_FINANZAMT}</p>
      </section>

      {/* Confidence detail */}
      {confidence.reasons.length > 0 && (
        <section className="bg-gray-900 border border-gray-800 rounded-lg p-5">
          <h2 className="text-sm font-semibold text-white mb-3">
            Why confidence is {confidence.level.toLowerCase()}
          </h2>
          <ul className="space-y-1.5">
            {confidence.reasons.map((r, i) => (
              <li key={i} className="text-xs text-gray-400 flex items-start gap-2">
                <span className="text-gray-600 mt-0.5">—</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
