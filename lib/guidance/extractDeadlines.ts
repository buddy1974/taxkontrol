import type { ExtractedDeadline } from './guidanceTypes'

const GERMAN_MONTHS: Record<string, number> = {
  januar: 1, februar: 2, märz: 3, maerz: 3, april: 4,
  mai: 5, juni: 6, juli: 7, august: 8,
  september: 9, oktober: 10, november: 11, dezember: 12,
}

function parseGermanDate(day: number, month: number, year: number): Date | null {
  if (day < 1 || day > 31 || month < 1 || month > 12) return null
  const fullYear = year < 100 ? 2000 + year : year
  const d = new Date(fullYear, month - 1, day)
  if (isNaN(d.getTime())) return null
  return d
}

function isUrgent(date: Date): boolean {
  const diffMs = date.getTime() - Date.now()
  return diffMs > 0 && diffMs < 7 * 24 * 60 * 60 * 1000
}

function isExpired(date: Date): boolean {
  return date.getTime() < Date.now()
}

export function extractDeadlines(text: string): ExtractedDeadline[] {
  const results: ExtractedDeadline[] = []
  const seen = new Set<string>()

  // Pattern 1: dd.mm.yyyy or d.m.yyyy (high confidence with keyword context)
  const numericPattern = /(\d{1,2})\.(\d{1,2})\.(\d{2,4})/g
  let m: RegExpExecArray | null

  while ((m = numericPattern.exec(text)) !== null) {
    const [rawText, dayStr, monthStr, yearStr] = m
    const day = parseInt(dayStr, 10)
    const month = parseInt(monthStr, 10)
    const year = parseInt(yearStr, 10)
    const date = parseGermanDate(day, month, year)
    if (!date || isExpired(date)) continue

    const key = date.toISOString().slice(0, 10)
    if (seen.has(key)) continue
    seen.add(key)

    // Check for deadline-related keywords near this date (±80 chars)
    const surroundingStart = Math.max(0, m.index - 80)
    const surroundingEnd = Math.min(text.length, m.index + rawText.length + 80)
    const surrounding = text.slice(surroundingStart, surroundingEnd).toLowerCase()
    const hasKeyword = /frist|bis|spätestens|zahlungsfrist|antwort|einreichen|vorlegen|zahlung|ablauf/.test(surrounding)

    results.push({
      date,
      rawText,
      confidence: hasKeyword ? 'HIGH' : 'MEDIUM',
      urgencyBoost: isUrgent(date),
    })
  }

  // Pattern 2: "X. MonatName YYYY" — e.g. "15. März 2026"
  const verbosePattern = /(\d{1,2})\.\s*(januar|februar|märz|maerz|april|mai|juni|juli|august|september|oktober|november|dezember)\s+(\d{4})/gi

  while ((m = verbosePattern.exec(text)) !== null) {
    const [rawText, dayStr, monthName, yearStr] = m
    const day = parseInt(dayStr, 10)
    const month = GERMAN_MONTHS[monthName.toLowerCase()]
    const year = parseInt(yearStr, 10)
    if (!month) continue

    const date = parseGermanDate(day, month, year)
    if (!date || isExpired(date)) continue

    const key = date.toISOString().slice(0, 10)
    if (seen.has(key)) continue
    seen.add(key)

    results.push({
      date,
      rawText,
      confidence: 'HIGH',
      urgencyBoost: isUrgent(date),
    })
  }

  return results.sort((a, b) => a.date.getTime() - b.date.getTime())
}

export function pickEarliestDeadline(deadlines: ExtractedDeadline[]): ExtractedDeadline | null {
  return deadlines[0] ?? null
}

export function deadlineUrgencyLabel(deadline: ExtractedDeadline | null): string {
  if (!deadline) return ''
  const diffDays = Math.ceil((deadline.date.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  if (diffDays <= 0) return 'Deadline has passed'
  if (diffDays === 1) return 'Due tomorrow'
  if (diffDays <= 7) return `Due in ${diffDays} days`
  if (diffDays <= 30) return `Due in ${diffDays} days`
  return `Due ${deadline.date.toLocaleDateString('de-DE')}`
}
