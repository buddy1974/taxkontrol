'use client'

import { useState } from 'react'

type UploadedDoc = { id: string; fileName: string; status: string }
type UnresolvedIssue = { title: string; description: string; priority: string; category: string; dueDate: string | null }

type ExportPackage = {
  meta: {
    generatedAt: string
    reportingYear: number
    reportingPeriod: string
    disclaimer: string
  }
  userProfile: {
    name: string
    email: string
    businessName: string | null
    taxType: string
    taxId: string | null
    vatId: string | null
  }
  financialSummary: {
    year: number
    totalIncome: number
    totalExpenses: number
    netProfit: number
    incomeTransactionCount: number
    expenseTransactionCount: number
  }
  uploadedDocuments: UploadedDoc[]
  missingDocuments: string[]
  categorizedTransactions: number
  uncategorizedTransactions: number
  unresolvedIssues: UnresolvedIssue[]
  preparationScore: number
  confidenceLevel: string
  confidenceScore: number
  suggestedQuestionsForSteuerberater: string[]
}

const PREP_BAR: Record<number, string> = {}
function prepColor(score: number): string {
  if (score >= 75) return 'bg-emerald-600'
  if (score >= 50) return 'bg-blue-600'
  if (score >= 25) return 'bg-amber-500'
  return 'bg-red-600'
}

const CONF_DOT: Record<string, string> = {
  HIGH: 'bg-emerald-500',
  MEDIUM: 'bg-amber-500',
  LOW: 'bg-red-500',
}

const TAX_TYPE_LABEL: Record<string, string> = {
  KLEINUNTERNEHMER: 'Kleinunternehmer (small business)',
  REGELBESTEUERUNG: 'Regelbesteuerung (standard VAT)',
  PAUSCHALIERUNG: 'Pauschalierung (flat rate)',
}

export default function PreparationPackagePanel() {
  const [pkg, setPkg] = useState<ExportPackage | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/v1/guidance/preparation-package/export')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setPkg(data)
    } catch (err) {
      setError('Could not load preparation package. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  function downloadJson() {
    if (!pkg) return
    const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `steuerberater-package-${pkg.meta.reportingYear}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  function downloadText() {
    if (!pkg) return
    const lines = [
      `STEUERBERATER PREPARATION PACKAGE`,
      `Generated: ${new Date(pkg.meta.generatedAt).toLocaleDateString('de-DE')}`,
      `Period: ${pkg.meta.reportingPeriod}`,
      ``,
      `--- PROFILE ---`,
      `Name: ${pkg.userProfile.name}`,
      `Business: ${pkg.userProfile.businessName ?? '—'}`,
      `Tax type: ${TAX_TYPE_LABEL[pkg.userProfile.taxType] ?? pkg.userProfile.taxType}`,
      pkg.userProfile.taxId ? `Tax ID: ${pkg.userProfile.taxId}` : '',
      ``,
      `--- FINANCIAL SUMMARY (${pkg.financialSummary.year}) ---`,
      `Total income:   €${pkg.financialSummary.totalIncome.toFixed(2)}`,
      `Total expenses: €${pkg.financialSummary.totalExpenses.toFixed(2)}`,
      `Net profit:     €${pkg.financialSummary.netProfit.toFixed(2)}`,
      `Transactions:   ${pkg.financialSummary.incomeTransactionCount} income, ${pkg.financialSummary.expenseTransactionCount} expense`,
      ``,
      `--- DOCUMENTS ---`,
      `Uploaded: ${pkg.uploadedDocuments.length}`,
      ...pkg.uploadedDocuments.map(d => `  - ${d.fileName} (${d.status})`),
      ``,
      `Missing documents:`,
      ...(pkg.missingDocuments.length > 0 ? pkg.missingDocuments.map(d => `  - ${d}`) : ['  None identified']),
      ``,
      `--- TRANSACTIONS ---`,
      `Categorized:   ${pkg.categorizedTransactions}`,
      `Uncategorized: ${pkg.uncategorizedTransactions}`,
      ``,
      `--- PREPARATION ---`,
      `Score: ${pkg.preparationScore}/100`,
      `Confidence: ${pkg.confidenceLevel} (${pkg.confidenceScore}/100)`,
      ``,
      `Unresolved issues: ${pkg.unresolvedIssues.length}`,
      ...pkg.unresolvedIssues.map(i => `  [${i.priority}] ${i.title}`),
      ``,
      `--- QUESTIONS FOR YOUR STEUERBERATER ---`,
      ...pkg.suggestedQuestionsForSteuerberater.map((q, i) => `${i + 1}. ${q}`),
      ``,
      `--- DISCLAIMER ---`,
      pkg.meta.disclaimer,
    ].filter(l => l !== undefined && l !== null)

    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `steuerberater-package-${pkg.meta.reportingYear}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h2 className="text-sm font-semibold text-white">Prepare for Steuerberater</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Generate a preparation package for your Steuerberater appointment.
          </p>
        </div>
        {!pkg && (
          <button
            onClick={load}
            disabled={loading}
            className="shrink-0 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors"
          >
            {loading ? 'Loading…' : 'Generate package'}
          </button>
        )}
      </div>

      {/* Savings message — careful wording */}
      <div className="bg-blue-950 border border-blue-800 rounded-lg p-3 mb-4">
        <p className="text-xs text-blue-300 leading-relaxed">
          Use this to prepare for your Steuerberater appointment. Organized records may reduce the time spent sorting documents together during your session.
        </p>
        <p className="text-xs text-blue-400 mt-1">
          This package is <strong>not</strong> a tax declaration. It is a preparation summary only.
        </p>
      </div>

      {error && (
        <div className="bg-red-950 border border-red-800 rounded-lg p-3 mb-4">
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}

      {!pkg && !loading && !error && (
        <p className="text-xs text-gray-500">Click &ldquo;Generate package&rdquo; to build your preparation summary.</p>
      )}

      {loading && (
        <p className="text-xs text-gray-500 animate-pulse">Building your package…</p>
      )}

      {pkg && (
        <div className="space-y-5">
          {/* Actions */}
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={downloadJson}
              className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-medium rounded-lg transition-colors"
            >
              Download JSON
            </button>
            <button
              onClick={downloadText}
              className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-medium rounded-lg transition-colors"
            >
              Download text summary
            </button>
            <button
              onClick={load}
              className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-500 text-xs rounded-lg transition-colors"
            >
              Refresh
            </button>
          </div>

          {/* Generated at */}
          <p className="text-xs text-gray-600">
            Generated {new Date(pkg.meta.generatedAt).toLocaleString('de-DE')} · Period: {pkg.meta.reportingPeriod}
          </p>

          {/* Profile */}
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Profile</h3>
            <div className="bg-gray-800 rounded-lg p-3 space-y-1">
              <p className="text-xs text-white">{pkg.userProfile.name}</p>
              {pkg.userProfile.businessName && (
                <p className="text-xs text-gray-400">{pkg.userProfile.businessName}</p>
              )}
              <p className="text-xs text-gray-500">
                {TAX_TYPE_LABEL[pkg.userProfile.taxType] ?? pkg.userProfile.taxType}
              </p>
              {pkg.userProfile.taxId && (
                <p className="text-xs text-gray-500">Tax ID: {pkg.userProfile.taxId}</p>
              )}
            </div>
          </div>

          {/* Financial summary */}
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              Financial summary {pkg.financialSummary.year}
            </h3>
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-gray-800 rounded-lg p-3">
                <p className="text-xs text-gray-500">Income</p>
                <p className="text-sm font-semibold text-emerald-400">€{pkg.financialSummary.totalIncome.toFixed(2)}</p>
                <p className="text-xs text-gray-600">{pkg.financialSummary.incomeTransactionCount} entries</p>
              </div>
              <div className="bg-gray-800 rounded-lg p-3">
                <p className="text-xs text-gray-500">Expenses</p>
                <p className="text-sm font-semibold text-red-400">€{pkg.financialSummary.totalExpenses.toFixed(2)}</p>
                <p className="text-xs text-gray-600">{pkg.financialSummary.expenseTransactionCount} entries</p>
              </div>
              <div className="bg-gray-800 rounded-lg p-3">
                <p className="text-xs text-gray-500">Net profit</p>
                <p className={`text-sm font-semibold ${pkg.financialSummary.netProfit >= 0 ? 'text-white' : 'text-red-400'}`}>
                  €{pkg.financialSummary.netProfit.toFixed(2)}
                </p>
              </div>
            </div>
          </div>

          {/* Preparation score */}
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Preparation score</h3>
            <div className="bg-gray-800 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${CONF_DOT[pkg.confidenceLevel] ?? 'bg-gray-500'}`} />
                  <span className="text-xs text-white font-medium">Confidence: {pkg.confidenceLevel}</span>
                </div>
                <span className="text-xs text-white font-bold">{pkg.preparationScore}/100</span>
              </div>
              <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${prepColor(pkg.preparationScore)}`}
                  style={{ width: `${pkg.preparationScore}%` }}
                />
              </div>
            </div>
          </div>

          {/* Documents */}
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              Documents ({pkg.uploadedDocuments.length} uploaded)
            </h3>
            {pkg.uploadedDocuments.length > 0 ? (
              <ul className="space-y-1">
                {pkg.uploadedDocuments.slice(0, 8).map(doc => (
                  <li key={doc.id} className="flex items-center gap-2 text-xs text-gray-400">
                    <span className="text-emerald-400">✓</span>
                    <span className="truncate">{doc.fileName}</span>
                    <span className="text-gray-600 shrink-0">{doc.status}</span>
                  </li>
                ))}
                {pkg.uploadedDocuments.length > 8 && (
                  <li className="text-xs text-gray-600">+{pkg.uploadedDocuments.length - 8} more</li>
                )}
              </ul>
            ) : (
              <p className="text-xs text-gray-500">No processed documents on file.</p>
            )}

            {pkg.missingDocuments.length > 0 && (
              <div className="mt-2">
                <p className="text-xs text-gray-500 mb-1">Missing documents:</p>
                <ul className="space-y-1">
                  {pkg.missingDocuments.map((d, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-amber-300">
                      <span className="text-amber-400 shrink-0">!</span>
                      {d}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Transactions */}
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Transactions</h3>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-gray-800 rounded-lg p-3">
                <p className="text-xs text-gray-500">Categorized</p>
                <p className="text-sm font-semibold text-white">{pkg.categorizedTransactions}</p>
              </div>
              <div className={`rounded-lg p-3 ${pkg.uncategorizedTransactions > 0 ? 'bg-amber-950 border border-amber-800' : 'bg-gray-800'}`}>
                <p className="text-xs text-gray-500">Uncategorized</p>
                <p className={`text-sm font-semibold ${pkg.uncategorizedTransactions > 0 ? 'text-amber-300' : 'text-white'}`}>
                  {pkg.uncategorizedTransactions}
                </p>
              </div>
            </div>
          </div>

          {/* Unresolved issues */}
          {pkg.unresolvedIssues.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                Unresolved issues ({pkg.unresolvedIssues.length})
              </h3>
              <ul className="space-y-2">
                {pkg.unresolvedIssues.slice(0, 5).map((issue, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className={`text-xs shrink-0 font-medium mt-0.5 ${
                      issue.priority === 'CRITICAL' ? 'text-red-400'
                      : issue.priority === 'HIGH' ? 'text-amber-400'
                      : 'text-gray-500'
                    }`}>
                      {issue.priority}
                    </span>
                    <div>
                      <p className="text-xs text-white">{issue.title}</p>
                      <p className="text-xs text-gray-500">{issue.description}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Steuerberater questions */}
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              Questions for your Steuerberater
            </h3>
            <ul className="space-y-2">
              {pkg.suggestedQuestionsForSteuerberater.map((q, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-blue-400 text-xs shrink-0 mt-0.5">{i + 1}.</span>
                  <p className="text-xs text-blue-300">{q}</p>
                </li>
              ))}
            </ul>
          </div>

          {/* Disclaimer */}
          <p className="text-xs text-gray-600 leading-relaxed border-t border-gray-800 pt-3">
            {pkg.meta.disclaimer}
          </p>
        </div>
      )}
    </div>
  )
}
