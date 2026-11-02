import type { Prisma } from '@prisma/client'
import { loadTaxStatusTimeline } from '@/lib/finance/loadPosition'
import { SINCE_ALWAYS, type TaxStatus, type TaxStatusEntry } from '@/lib/finance/taxStatus'
import { berlinMidnight } from '@/lib/time/berlin'
import { recordAudit } from '@/lib/audit'
import { lockFor } from '@/lib/locks'

/**
 * Writes a tax-status change into the user's status history.
 *
 * - The changed fields apply from `effectiveFrom` (a Berlin day) as a patch, **until the next
 *   explicit switch of that field** (NF-09): a back-dated change never overwrites a later
 *   status switch, and entries before the date stay untouched — earlier periods keep the
 *   status valid then, so their taxes cannot disappear.
 * - 'ALWAYS' (initial setup / correcting a wrong setting) sets the fields for the whole history.
 * - Consecutive identical entries are merged. Concurrent changes of one user are serialised.
 * The User.taxType / TaxProfile.vatFilingPeriod columns mirror the status valid today
 * (older code paths and the account export read them).
 */
export type EffectiveFrom = 'ALWAYS' | { year: number; month: number; day: number }

export async function applyTaxStatusChange(
  tx: Prisma.TransactionClient,
  userId: string,
  change: Partial<TaxStatus>,
  effectiveFrom: EffectiveFrom,
  now: Date = new Date()
): Promise<TaxStatus> {
  // Read-modify-write of the whole history: serialise per user (two tabs, double click).
  await lockFor(tx, `taxstatus:${userId}`)
  const timeline = await loadTaxStatusTimeline(userId, tx)
  const from = effectiveFrom === 'ALWAYS' ? SINCE_ALWAYS : berlinMidnight(effectiveFrom.year, effectiveFrom.month, effectiveFrom.day)
  const before = timeline.entries.map(e => ({ ...e, validFrom: e.validFrom.toISOString() }))

  // The change is a PATCH applied to the status from `from` on: later entries keep their
  // other fields (changing only the filing period must not undo a later switch to
  // Regelbesteuerung). Entries before `from` stay untouched.
  const list: TaxStatusEntry[] = timeline.entries.map(e => ({ ...e }))
  if (!list.some(e => e.validFrom.getTime() === from.getTime())) {
    list.push({ ...timeline.statusAt(from), validFrom: from })
  }
  list.sort((a, b) => a.validFrom.getTime() - b.validFrom.getTime())
  const keys = Object.keys(change) as Array<keyof TaxStatus>
  // End of the patch per field: the next explicit switch of that field after `from`.
  const endFor = (key: keyof TaxStatus): number => {
    if (effectiveFrom === 'ALWAYS') return Infinity
    for (let i = 1; i < list.length; i++) {
      if (list[i].validFrom.getTime() > from.getTime() && list[i][key] !== list[i - 1][key]) return list[i].validFrom.getTime()
    }
    return Infinity
  }
  const ends = new Map(keys.map(k => [k, endFor(k)]))
  const patched = list.map(e => {
    const t = e.validFrom.getTime()
    if (t < from.getTime()) return e
    const out = { ...e }
    for (const k of keys) if (t < ends.get(k)!) (out as Record<string, unknown>)[k] = change[k]
    return out
  })
  const same = (a: TaxStatus, b: TaxStatus) =>
    a.taxType === b.taxType && a.vatMethod === b.vatMethod && a.vatFilingPeriod === b.vatFilingPeriod && a.dauerfristverlaengerung === b.dauerfristverlaengerung
  const merged: TaxStatusEntry[] = []
  for (const e of patched) if (merged.length === 0 || !same(merged[merged.length - 1], e)) merged.push(e)

  await tx.taxStatusPeriod.deleteMany({ where: { userId } })
  await tx.taxStatusPeriod.createMany({
    data: merged.map(e => ({
      userId,
      validFrom: e.validFrom,
      taxType: e.taxType,
      vatMethod: e.vatMethod,
      vatFilingPeriod: e.vatFilingPeriod,
      dauerfristverlaengerung: e.dauerfristverlaengerung,
    })),
  })

  const after = await loadTaxStatusTimeline(userId, tx)
  const today = after.statusAt(now)
  await tx.user.update({ where: { id: userId }, data: { taxType: today.taxType } })
  await tx.taxProfile.upsert({
    where: { userId },
    update: { vatFilingPeriod: today.vatFilingPeriod },
    create: { userId, vatFilingPeriod: today.vatFilingPeriod },
  })
  await recordAudit(
    {
      userId,
      entityType: 'ACCOUNT',
      entityId: userId,
      action: 'UPDATE',
      before: { taxStatusHistory: before },
      after: { taxStatusHistory: after.entries.map(e => ({ ...e, validFrom: e.validFrom.toISOString() })) },
    },
    tx
  )
  return today
}

/**
 * The fields of `requested` that differ from the status valid at `effectiveFrom` (today when
 * undefined). For 'ALWAYS', a field counts when any history entry differs from it. Comparing
 * with today's status instead would silently drop a back-dated correction (NF-08).
 */
export function statusChangeAgainst(
  timeline: { entries: TaxStatusEntry[]; statusAt(d: Date): TaxStatus },
  requested: Partial<TaxStatus>,
  effectiveFrom: EffectiveFrom | undefined,
  now: Date
): Partial<TaxStatus> {
  const out: Partial<TaxStatus> = {}
  const base =
    effectiveFrom === undefined ? timeline.statusAt(now)
    : effectiveFrom === 'ALWAYS' ? null
    : timeline.statusAt(berlinMidnight(effectiveFrom.year, effectiveFrom.month, effectiveFrom.day))
  for (const k of Object.keys(requested) as Array<keyof TaxStatus>) {
    const v = requested[k]
    if (v === undefined) continue
    const differs = base ? base[k] !== v : timeline.entries.some(e => e[k] !== v)
    if (differs) (out as Record<string, unknown>)[k] = v
  }
  return out
}

/** True when the user has recorded nothing yet (then a status choice is the initial setup). */
export async function hasNoRecords(tx: Pick<Prisma.TransactionClient, 'transaction' | 'receivable' | 'payable'>, userId: string): Promise<boolean> {
  const [t, r, p] = await Promise.all([
    tx.transaction.count({ where: { userId } }),
    tx.receivable.count({ where: { userId } }),
    tx.payable.count({ where: { userId } }),
  ])
  return t + r + p === 0
}
