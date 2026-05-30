import type { DeadlineRisk } from './finanzamtTypes'

export function computeDeadlineRisk(latestDeadline: Date | null): DeadlineRisk {
  if (!latestDeadline) {
    return {
      daysRemaining: null,
      level: 'NONE',
      label: 'No deadline detected',
      action: 'Check the letter for any response dates or deadlines mentioned.',
    }
  }

  const now = new Date()
  const daysRemaining = Math.ceil((latestDeadline.getTime() - now.getTime()) / 86400000)

  if (daysRemaining <= 0) {
    return {
      daysRemaining,
      level: 'EXPIRED',
      label: 'Deadline has passed',
      action: 'Contact a Steuerberater immediately to understand your options and whether a late response is still possible.',
    }
  }

  if (daysRemaining <= 3) {
    return {
      daysRemaining,
      level: 'CRITICAL',
      label: `${daysRemaining} day(s) remaining — act immediately`,
      action: 'Contact a Steuerberater today. Gather all available documents and prepare to respond now.',
    }
  }

  if (daysRemaining <= 7) {
    return {
      daysRemaining,
      level: 'HIGH',
      label: `${daysRemaining} day(s) remaining — act this week`,
      action: 'Start gathering documents immediately. Book a Steuerberater appointment as soon as possible.',
    }
  }

  if (daysRemaining <= 30) {
    return {
      daysRemaining,
      level: 'MEDIUM',
      label: `${daysRemaining} day(s) remaining`,
      action: 'Complete the checklist items below and plan your response within the next week.',
    }
  }

  return {
    daysRemaining,
    level: 'LOW',
    label: `${daysRemaining} day(s) remaining — you have time`,
    action: 'Use this time to complete your records and prepare thoroughly before the deadline.',
  }
}
